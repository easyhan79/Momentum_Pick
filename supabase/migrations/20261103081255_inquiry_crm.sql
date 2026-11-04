BEGIN;
ALTER TABLE public.property_inquiries
 ADD COLUMN service_interest text NOT NULL DEFAULT 'property' CHECK(service_interest IN ('property','free_ad','paid_consulting')),
 ADD COLUMN source_channel text NOT NULL DEFAULT 'showroom' CHECK(source_channel IN ('showroom','telegram','blog','instagram','referral','manual','other')),
 ADD COLUMN lead_stage text NOT NULL DEFAULT 'new' CHECK(lead_stage IN ('new','contacted','free_consulting','proposal','paid','lost')),
 ADD COLUMN staff_notes text NOT NULL DEFAULT '' CHECK(length(staff_notes)<=4000),
 ADD COLUMN quoted_amount bigint NOT NULL DEFAULT 0 CHECK(quoted_amount BETWEEN 0 AND 1000000000000),
 ADD COLUMN paid_amount bigint NOT NULL DEFAULT 0 CHECK(paid_amount BETWEEN 0 AND 1000000000000),
 ADD COLUMN crm_revision integer NOT NULL DEFAULT 1 CHECK(crm_revision>0),
 ADD COLUMN converted_at timestamptz,
 ADD COLUMN closed_at timestamptz,
 ADD COLUMN redacted_at timestamptz,
 ADD COLUMN request_fingerprint text NOT NULL DEFAULT '' CHECK(length(request_fingerprint)<=64),
 ADD COLUMN notification_next_attempt timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN notification_claimed_at timestamptz,
 ADD COLUMN notification_error_code text NOT NULL DEFAULT '' CHECK(length(notification_error_code)<=50);

CREATE TABLE public.inquiry_activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 inquiry_id uuid NOT NULL REFERENCES public.property_inquiries(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 from_stage text NOT NULL, to_stage text NOT NULL,
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
 quoted_amount bigint NOT NULL, paid_amount bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inquiry_activity_inquiry_created_idx ON public.inquiry_activity(inquiry_id,created_at DESC);
CREATE INDEX property_inquiries_lead_stage_created_idx ON public.property_inquiries(lead_stage,created_at DESC);
CREATE INDEX property_inquiries_created_idx ON public.property_inquiries(created_at DESC);
CREATE INDEX property_inquiries_converted_idx ON public.property_inquiries(converted_at) WHERE lead_stage='paid';
CREATE INDEX property_inquiries_closed_retention_idx ON public.property_inquiries(closed_at) WHERE redacted_at IS NULL;
CREATE TABLE public.inquiry_request_limits (
 rate_key text NOT NULL CHECK(length(rate_key)=64),
 window_start timestamptz NOT NULL,
 request_count integer NOT NULL CHECK(request_count>0),
 PRIMARY KEY(rate_key,window_start)
);
ALTER TABLE public.inquiry_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_activity FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_request_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_request_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.inquiry_activity,public.inquiry_request_limits FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.inquiry_activity TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.inquiry_request_limits TO service_role;

CREATE FUNCTION public.crm_register_inquiry(p_request_id uuid,p_fingerprint text,p_rate_key text,p_slug text,p_property_id uuid,p_admin boolean,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE existing public.property_inquiries%ROWTYPE; room public.property_showrooms%ROWTYPE; created uuid; rate_count integer;
BEGIN
 IF length(p_fingerprint)<>64 THEN RAISE EXCEPTION 'invalid_request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO existing FROM public.property_inquiries WHERE request_id=p_request_id;
 IF FOUND THEN
  IF existing.request_fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'request_conflict'; END IF;
  RETURN jsonb_build_object('id',existing.id,'existing',true);
 END IF;
 IF p_admin THEN
  SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property_id FOR SHARE;
 ELSE
  SELECT * INTO room FROM public.property_showrooms WHERE slug=p_slug AND showroom_status='published' AND approved_at IS NOT NULL FOR SHARE;
 END IF;
 IF room.id IS NULL THEN RAISE EXCEPTION 'showroom_unavailable'; END IF;
 IF NOT p_admin THEN
  INSERT INTO public.inquiry_request_limits(rate_key,window_start,request_count)
   VALUES(p_rate_key,to_timestamp(floor(extract(epoch FROM now())/600)*600),1)
   ON CONFLICT(rate_key,window_start) DO UPDATE SET request_count=public.inquiry_request_limits.request_count+1
   RETURNING request_count INTO rate_count;
  IF rate_count>5 THEN RAISE EXCEPTION 'rate_limited'; END IF;
 END IF;
 INSERT INTO public.property_inquiries(property_id,showroom_id,request_id,request_fingerprint,name,phone,deal_type,intended_use,memo,consent_version,consented_at,service_interest,source_channel)
 VALUES(room.property_id,room.id,p_request_id,p_fingerprint,p_data->>'name',p_data->>'phone',p_data->>'deal_type',p_data->>'intended_use',coalesce(p_data->>'memo',''),p_data->>'consent_version',now(),p_data->>'service_interest',p_data->>'source_channel') RETURNING id INTO created;
 RETURN jsonb_build_object('id',created,'existing',false);
END; $$;

CREATE FUNCTION public.crm_update_inquiry(p_id uuid,p_revision integer,p_actor uuid,p_stage text,p_notes text,p_quoted bigint,p_paid bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE current public.property_inquiries%ROWTYPE; next_revision integer;
BEGIN
 SELECT * INTO current FROM public.property_inquiries WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'inquiry_not_found'; END IF;
 IF current.redacted_at IS NOT NULL THEN RAISE EXCEPTION 'retention_expired'; END IF;
 IF current.crm_revision<>p_revision OR p_revision>=2147483647 THEN RAISE EXCEPTION 'revision_conflict'; END IF;
 IF p_stage NOT IN ('new','contacted','free_consulting','proposal','paid','lost') OR length(p_notes)>4000 OR p_quoted NOT BETWEEN 0 AND 1000000000000 OR p_paid NOT BETWEEN 0 AND 1000000000000 THEN RAISE EXCEPTION 'invalid_edits'; END IF;
 IF p_stage<>'paid' AND p_paid<>0 THEN RAISE EXCEPTION 'paid_stage_required'; END IF;
 UPDATE public.property_inquiries SET lead_stage=p_stage,staff_notes=p_notes,quoted_amount=p_quoted,paid_amount=p_paid,crm_revision=crm_revision+1,
  converted_at=CASE WHEN p_stage='paid' THEN coalesce(converted_at,now()) ELSE NULL END,
  closed_at=CASE WHEN p_stage IN ('paid','lost') THEN coalesce(closed_at,now()) ELSE NULL END
 WHERE id=p_id RETURNING crm_revision INTO next_revision;
 INSERT INTO public.inquiry_activity(inquiry_id,actor_id,from_stage,to_stage,notes,quoted_amount,paid_amount)
 VALUES(p_id,p_actor,current.lead_stage,p_stage,p_notes,p_quoted,p_paid);
 RETURN jsonb_build_object('revision',next_revision);
END; $$;

CREATE FUNCTION public.crm_claim_notifications(p_limit integer,p_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,name text,phone text,intended_use text,property_id uuid,service_interest text,notification_attempts integer)
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 WITH picked AS (
  SELECT i.id FROM public.property_inquiries i WHERE (p_id IS NULL OR i.id=p_id) AND i.redacted_at IS NULL
   AND i.notification_status IN ('pending','failed') AND i.notification_attempts<8 AND i.notification_next_attempt<=now()
   AND (i.notification_claimed_at IS NULL OR i.notification_claimed_at<now()-interval '5 minutes')
  ORDER BY i.created_at FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,20))
 ), claimed AS (
  UPDATE public.property_inquiries i SET notification_status='pending',notification_attempts=i.notification_attempts+1,notification_claimed_at=now()
  FROM picked WHERE i.id=picked.id RETURNING i.*
 ) SELECT c.id,c.name,c.phone,c.intended_use,c.property_id,c.service_interest,c.notification_attempts FROM claimed c;
$$;
CREATE FUNCTION public.crm_complete_notification(p_id uuid,p_attempt integer,p_success boolean)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 UPDATE public.property_inquiries SET notification_status=CASE WHEN p_success THEN 'sent' ELSE 'failed' END,
 notification_claimed_at=NULL,notification_error_code=CASE WHEN p_success THEN '' ELSE 'delivery_failed' END,
 notification_next_attempt=now()+least(3600,60*power(2,least(p_attempt,6))) * interval '1 second'
 WHERE id=p_id AND notification_attempts=p_attempt AND notification_claimed_at IS NOT NULL AND redacted_at IS NULL;
$$;
CREATE FUNCTION public.crm_retry_notification(p_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 UPDATE public.property_inquiries SET notification_status='pending',notification_attempts=0,notification_next_attempt=now(),notification_claimed_at=NULL,notification_error_code=''
 WHERE id=p_id AND redacted_at IS NULL AND notification_status<>'sent' AND (notification_claimed_at IS NULL OR notification_claimed_at<now()-interval '5 minutes');
$$;
CREATE FUNCTION public.crm_retention_cleanup()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE ids uuid[]; cleaned integer;
BEGIN
 WITH expired AS (UPDATE public.property_inquiries SET name='보관기간 만료',phone='0000000',intended_use='보관기간 만료',memo='',staff_notes='',request_fingerprint='',redacted_at=now(),notification_status='failed',notification_claimed_at=NULL,notification_error_code='retention_expired',crm_revision=crm_revision+1
  WHERE closed_at<now()-interval '90 days' AND redacted_at IS NULL RETURNING id)
 SELECT array_agg(id),count(*) INTO ids,cleaned FROM expired;
 UPDATE public.inquiry_activity SET notes='' WHERE inquiry_id=ANY(ids);
 DELETE FROM public.inquiry_request_limits WHERE window_start<now()-interval '1 day';
 RETURN cleaned;
END; $$;
CREATE FUNCTION public.crm_summary(p_from timestamptz,p_to timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH cohort AS (SELECT i.*,EXISTS(SELECT 1 FROM public.inquiry_activity a WHERE a.inquiry_id=i.id AND a.to_stage='free_consulting') OR i.lead_stage='free_consulting' AS was_free
  FROM public.property_inquiries i WHERE i.created_at>=p_from AND i.created_at<p_to),
 stages AS (SELECT lead_stage,count(*) AS amount FROM cohort GROUP BY lead_stage),
 sources AS (SELECT source_channel,count(*) AS amount FROM cohort GROUP BY source_channel)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM cohort),'stages',(SELECT coalesce(jsonb_object_agg(lead_stage,amount),'{}') FROM stages),
 'sources',(SELECT coalesce(jsonb_object_agg(source_channel,amount),'{}') FROM sources),
 'free_consultations',(SELECT count(*) FROM cohort WHERE was_free),'free_to_paid',(SELECT count(*) FROM cohort WHERE was_free AND lead_stage='paid'),
 'paid_count',(SELECT count(*) FROM public.property_inquiries WHERE converted_at>=p_from AND converted_at<p_to AND lead_stage='paid'),
 'paid_amount',(SELECT coalesce(sum(paid_amount),0) FROM public.property_inquiries WHERE converted_at>=p_from AND converted_at<p_to AND lead_stage='paid'),
 'notification_backlog',(SELECT count(*) FROM public.property_inquiries WHERE notification_status IN ('pending','failed') AND redacted_at IS NULL));
$$;
REVOKE ALL ON FUNCTION public.crm_register_inquiry(uuid,text,text,text,uuid,boolean,jsonb),public.crm_update_inquiry(uuid,integer,uuid,text,text,bigint,bigint),public.crm_claim_notifications(integer,uuid),public.crm_complete_notification(uuid,integer,boolean),public.crm_retry_notification(uuid),public.crm_retention_cleanup(),public.crm_summary(timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_register_inquiry(uuid,text,text,text,uuid,boolean,jsonb),public.crm_update_inquiry(uuid,integer,uuid,text,text,bigint,bigint),public.crm_claim_notifications(integer,uuid),public.crm_complete_notification(uuid,integer,boolean),public.crm_retry_notification(uuid),public.crm_retention_cleanup(),public.crm_summary(timestamptz,timestamptz) TO service_role;
COMMIT;
