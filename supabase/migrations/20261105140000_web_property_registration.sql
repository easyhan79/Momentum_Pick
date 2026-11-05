BEGIN;
-- Manual web drafts reserve a queue row with an infinite due date. Existing
-- analysis_claim therefore cannot accidentally analyze an unfinished form.
CREATE TABLE public.property_web_intakes (
 property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','queued')),
 payload_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(created_by,request_id)
);
ALTER TABLE public.property_web_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_web_intakes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_web_intakes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.property_web_intakes TO service_role;

CREATE FUNCTION public.web_create_property(p_request uuid,p_actor uuid,p_content jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE existing public.property_web_intakes; chosen uuid; fingerprint text;
BEGIN
 IF p_request IS NULL OR p_actor IS NULL OR jsonb_typeof(p_content) IS DISTINCT FROM 'object'
 OR p_content->>'schema_version' IS DISTINCT FROM '1.0' OR length(p_content::text)>65000
 OR jsonb_typeof(p_content->'propertyProfile') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_registration';END IF;
 fingerprint:=md5(p_content::text);
 PERFORM pg_advisory_xact_lock(hashtextextended('web-create:'||p_actor||':'||p_request,0));
 SELECT * INTO existing FROM public.property_web_intakes WHERE created_by=p_actor AND request_id=p_request;
 IF FOUND THEN
  IF existing.payload_hash<>fingerprint THEN RAISE EXCEPTION 'registration_request_conflict';END IF;
  RETURN jsonb_build_object('property_id',existing.property_id,'duplicate',true);
 END IF;
 chosen:=gen_random_uuid();
 INSERT INTO public.properties(id,address,raw_input,status) VALUES(chosen,nullif(p_content->>'address',''),'웹 등록 임시 저장','pending');
 INSERT INTO public.property_analysis_jobs(property_id,next_attempt_at) VALUES(chosen,'infinity'::timestamptz);
 INSERT INTO public.property_showrooms(property_id,slug,showroom_status,draft_content)
 VALUES(chosen,'property-'||chosen,'draft',jsonb_set(p_content,'{id}',to_jsonb(chosen::text)));
 INSERT INTO public.property_web_intakes(property_id,request_id,created_by,payload_hash) VALUES(chosen,p_request,p_actor,fingerprint);
 RETURN jsonb_build_object('property_id',chosen,'duplicate',false);
END $$;

CREATE FUNCTION public.web_queue_analysis(p_property uuid,p_revision integer,p_raw text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE room public.property_showrooms; job public.property_analysis_jobs; intake public.property_web_intakes;
BEGIN
 IF p_property IS NULL OR p_revision IS NULL OR p_revision<1 OR p_raw IS NULL OR length(btrim(p_raw))=0 OR length(p_raw)>60000 THEN RAISE EXCEPTION 'invalid_registration';END IF;
 SELECT * INTO intake FROM public.property_web_intakes WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'web_intake_missing';END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft_missing';END IF;
 IF room.revision<>p_revision THEN RAISE EXCEPTION 'revision_conflict';END IF;
 SELECT * INTO job FROM public.property_analysis_jobs WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'web_intake_missing';END IF;
 IF intake.state='queued' AND job.state IN ('waiting','running','done') THEN
  RETURN jsonb_build_object('queued',false,'state',job.state);
 END IF;
 IF job.state='running' THEN RAISE EXCEPTION 'analysis_already_running';END IF;
 UPDATE public.properties SET raw_input=p_raw,status='pending',address=nullif(room.draft_content->>'address','') WHERE id=p_property;
 UPDATE public.property_analysis_jobs SET state='waiting',attempts=0,next_attempt_at=now(),lease_until=NULL,claim_token=NULL,last_error_code='',updated_at=now() WHERE property_id=p_property;
 UPDATE public.property_web_intakes SET state='queued' WHERE property_id=p_property;
 RETURN jsonb_build_object('queued',true,'state','waiting');
END $$;
REVOKE ALL ON FUNCTION public.web_create_property(uuid,uuid,jsonb),public.web_queue_analysis(uuid,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.web_create_property(uuid,uuid,jsonb),public.web_queue_analysis(uuid,integer,text) TO service_role;
COMMIT;
