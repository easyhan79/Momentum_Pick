BEGIN;
CREATE TABLE public.telegram_intake_batches(
 property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE RESTRICT,
 chat_id text NOT NULL CHECK(chat_id ~ '^-?[0-9]{1,20}$'),
 batch_key text NOT NULL CHECK(length(batch_key) BETWEEN 1 AND 160),
 receipt_state text NOT NULL DEFAULT 'waiting' CHECK(receipt_state IN ('waiting','sending','sent','failed')),
 receipt_attempts int NOT NULL DEFAULT 0 CHECK(receipt_attempts BETWEEN 0 AND 5),
 receipt_token uuid,receipt_lease timestamptz,receipt_due timestamptz NOT NULL DEFAULT now(),
 receipt_error text NOT NULL DEFAULT '',dispatch_code text NOT NULL DEFAULT 'waiting',
 updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(chat_id,batch_key)
);
CREATE TABLE public.telegram_intake_updates(
 update_id bigint PRIMARY KEY,property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
 chat_id text NOT NULL,message_id bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telegram_intake_updates_property_idx ON public.telegram_intake_updates(property_id);
CREATE TABLE public.telegram_merged_sources(
 source_property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE RESTRICT,
 property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
 original_input text NOT NULL,merged_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telegram_merged_sources_property_idx ON public.telegram_merged_sources(property_id);
ALTER TABLE public.telegram_merged_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_merged_sources FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_merged_sources FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.telegram_merged_sources TO service_role;
CREATE INDEX telegram_receipts_due_idx ON public.telegram_intake_batches(receipt_due) WHERE receipt_state IN ('waiting','sending');
ALTER TABLE public.telegram_intake_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_intake_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_intake_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_intake_updates FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_intake_batches,public.telegram_intake_updates FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.telegram_intake_batches,public.telegram_intake_updates TO service_role;

CREATE FUNCTION public.telegram_ingest(p_update bigint,p_chat text,p_message bigint,p_group text,p_text text,p_file text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE property uuid; batch text; original text; is_first boolean:=false; q public.property_analysis_jobs; seen public.telegram_intake_updates;
BEGIN
 IF p_update IS NULL OR p_update<0 OR p_message IS NULL OR p_chat IS NULL OR p_chat !~ '^-?[0-9]{1,20}$'
 OR length(coalesce(p_text,''))>50000 OR (coalesce(p_file,'')<>'' AND (p_file !~ '^[A-Za-z0-9_-]+$' OR length(p_file)>1024))
 OR length(coalesce(p_group,''))>120 OR (coalesce(p_text,'')='' AND coalesce(p_file,'')='') THEN RAISE EXCEPTION 'invalid_intake';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('telegram-update:'||p_update,0));
 SELECT * INTO seen FROM public.telegram_intake_updates WHERE update_id=p_update;
 IF FOUND THEN
  IF seen.chat_id<>p_chat OR seen.message_id<>p_message THEN RAISE EXCEPTION 'update_conflict';END IF;
  RETURN jsonb_build_object('property_id',seen.property_id,'duplicate',true,'first',false);
 END IF;
 batch:=CASE WHEN coalesce(p_group,'')<>'' THEN 'album:'||p_group ELSE 'message:'||p_message END;
 PERFORM pg_advisory_xact_lock(hashtextextended('telegram-batch:'||p_chat||':'||batch,0));
 SELECT property_id INTO property FROM public.telegram_intake_batches WHERE chat_id=p_chat AND batch_key=batch FOR UPDATE;
 original:=CASE WHEN coalesce(p_file,'')<>'' THEN '[FILE_ID:'||p_file||'] ' ELSE '' END||coalesce(p_text,'');
 IF property IS NULL THEN
  property:=gen_random_uuid();is_first:=true;
  INSERT INTO public.properties(id,raw_input,status) VALUES(property,original,'pending');
  INSERT INTO public.telegram_intake_batches(property_id,chat_id,batch_key) VALUES(property,p_chat,batch);
  INSERT INTO public.property_analysis_jobs(property_id,next_attempt_at) VALUES(property,now()+interval '30 seconds');
 ELSE
  SELECT * INTO q FROM public.property_analysis_jobs WHERE property_id=property FOR UPDATE;
  IF q.state<>'waiting' OR q.attempts<>0 THEN RAISE EXCEPTION 'intake_already_processing';END IF;
  IF (SELECT length(raw_input)+length(original) FROM public.properties WHERE id=property)>60000 THEN RAISE EXCEPTION 'intake_too_large';END IF;
  UPDATE public.properties SET raw_input=raw_input||E'\n'||original WHERE id=property AND status='pending';
  UPDATE public.property_analysis_jobs SET next_attempt_at=now()+interval '30 seconds',updated_at=now() WHERE property_id=property;
 END IF;
 INSERT INTO public.telegram_intake_updates(update_id,property_id,chat_id,message_id) VALUES(p_update,property,p_chat,p_message);
 RETURN jsonb_build_object('property_id',property,'duplicate',false,'first',is_first);
END $$;

CREATE FUNCTION public.telegram_receipt_claim(p_property uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE chosen uuid; result public.telegram_intake_batches;
BEGIN
 SELECT property_id INTO chosen FROM public.telegram_intake_batches
 WHERE (p_property IS NULL OR property_id=p_property) AND receipt_attempts<5 AND receipt_due<=now()
 AND (receipt_state='waiting' OR (receipt_state='sending' AND receipt_lease<now()))
 ORDER BY receipt_due LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF chosen IS NULL THEN RETURN NULL;END IF;
 UPDATE public.telegram_intake_batches SET receipt_state='sending',receipt_attempts=receipt_attempts+1,
 receipt_token=gen_random_uuid(),receipt_lease=now()+interval '2 minutes',updated_at=now()
 WHERE property_id=chosen RETURNING * INTO result;
 RETURN jsonb_build_object('property_id',result.property_id,'chat_id',result.chat_id,'token',result.receipt_token);
END $$;
CREATE FUNCTION public.telegram_receipt_complete(p_property uuid,p_token uuid,p_success boolean,p_error text DEFAULT '') RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_error !~ '^[a-z0-9_]{0,60}$' THEN RAISE EXCEPTION 'invalid_error_code';END IF;
 UPDATE public.telegram_intake_batches SET receipt_state=CASE WHEN p_success THEN 'sent' WHEN receipt_attempts>=5 THEN 'failed' ELSE 'waiting' END,
 receipt_error=p_error,receipt_token=NULL,receipt_lease=NULL,receipt_due=now()+interval '1 minute',updated_at=now()
 WHERE property_id=p_property AND receipt_state='sending' AND receipt_token=p_token;
 RETURN FOUND;
END $$;
CREATE FUNCTION public.telegram_dispatch_result(p_property uuid,p_code text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_code !~ '^[a-z0-9_]{1,60}$' THEN RAISE EXCEPTION 'invalid_dispatch_code';END IF;
 UPDATE public.telegram_intake_batches SET dispatch_code=p_code,updated_at=now() WHERE property_id=p_property;
END $$;
REVOKE ALL ON FUNCTION public.telegram_ingest(bigint,text,bigint,text,text,text),public.telegram_receipt_claim(uuid),public.telegram_receipt_complete(uuid,uuid,boolean,text),public.telegram_dispatch_result(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_ingest(bigint,text,bigint,text,text,text),public.telegram_receipt_claim(uuid),public.telegram_receipt_complete(uuid,uuid,boolean,text),public.telegram_dispatch_result(uuid,text) TO service_role;
COMMIT;
