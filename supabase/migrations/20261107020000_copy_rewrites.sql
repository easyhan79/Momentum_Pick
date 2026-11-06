BEGIN;
-- Independent text candidates; never rewrite properties, images or approval snapshots.
CREATE TABLE public.property_copy_rewrites (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
 requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 base_revision integer NOT NULL CHECK(base_revision>0),
 fields text[] NOT NULL CHECK(cardinality(fields) BETWEEN 1 AND 5 AND fields <@ ARRAY['subtitle','summary','target_1_blog','target_2_blog','insta_caption']::text[]),
 instruction text NOT NULL CHECK(length(instruction)<=1000),
 source jsonb NOT NULL CHECK(jsonb_typeof(source)='object' AND octet_length(source::text)<=100000),
 original jsonb NOT NULL CHECK(jsonb_typeof(original)='object'),
 fingerprint text NOT NULL,
 result jsonb,
 generation jsonb,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','done','failed','applied','discarded')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 claim_token uuid,
 last_error_code text NOT NULL DEFAULT '' CHECK(length(last_error_code)<=60),
 applied_revision integer,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX copy_rewrite_one_pending ON public.property_copy_rewrites(property_id) WHERE state IN ('queued','running','done');
CREATE INDEX copy_rewrite_due ON public.property_copy_rewrites(next_attempt_at) WHERE state IN ('queued','running');
ALTER TABLE public.property_copy_rewrites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_copy_rewrites FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_copy_rewrites FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.property_copy_rewrites TO service_role;

CREATE FUNCTION public.copy_rewrite_queue(p_id uuid,p_property uuid,p_actor uuid,p_revision integer,p_fields text[],p_instruction text,p_source jsonb,p_original jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE room public.property_showrooms; previous public.property_copy_rewrites; digest text; item text;
BEGIN
 IF p_id IS NULL OR p_actor IS NULL OR p_property IS NULL OR p_revision IS NULL OR p_revision<1 OR p_revision>=2147483647 OR p_fields IS NULL OR cardinality(p_fields) NOT BETWEEN 1 AND 5
 OR NOT p_fields <@ ARRAY['subtitle','summary','target_1_blog','target_2_blog','insta_caption']::text[] OR array_position(p_fields,NULL) IS NOT NULL
 OR cardinality(p_fields)<>(SELECT count(DISTINCT f) FROM unnest(p_fields) f)
 OR p_instruction IS NULL OR length(p_instruction)>1000 OR jsonb_typeof(p_source) IS DISTINCT FROM 'object' OR octet_length(p_source::text)>100000
 OR jsonb_typeof(p_original) IS DISTINCT FROM 'object' OR octet_length(p_original::text)>250000 THEN RAISE EXCEPTION 'rewrite_invalid'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_original))<>cardinality(p_fields) THEN RAISE EXCEPTION 'rewrite_invalid'; END IF;
 FOREACH item IN ARRAY p_fields LOOP
  IF jsonb_typeof(p_original->item) IS DISTINCT FROM 'string' OR length(p_original->>item)>(CASE item WHEN 'subtitle' THEN 100 WHEN 'summary' THEN 4000 ELSE 18000 END) THEN RAISE EXCEPTION 'rewrite_invalid'; END IF;
 END LOOP;
 digest:=md5(jsonb_build_array(p_property,p_actor,p_revision,p_fields,p_instruction,p_source,p_original)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO previous FROM public.property_copy_rewrites WHERE id=p_id;
 IF FOUND THEN
  IF previous.fingerprint<>digest THEN RAISE EXCEPTION 'rewrite_request_conflict'; END IF;
  RETURN jsonb_build_object('id',previous.id,'state',previous.state,'queued',false);
 END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft_missing'; END IF;
 IF room.revision<>p_revision THEN RAISE EXCEPTION 'revision_conflict'; END IF;
 IF EXISTS(SELECT 1 FROM public.property_copy_rewrites WHERE property_id=p_property AND state IN ('queued','running','done')) THEN RAISE EXCEPTION 'rewrite_busy'; END IF;
 IF (SELECT count(*) FROM public.property_copy_rewrites WHERE property_id=p_property AND created_at>now()-interval '1 hour')>=3 THEN RAISE EXCEPTION 'rewrite_rate_limited'; END IF;
 INSERT INTO public.property_copy_rewrites(id,property_id,requested_by,base_revision,fields,instruction,source,original,fingerprint)
 VALUES(p_id,p_property,p_actor,p_revision,p_fields,p_instruction,p_source,p_original,digest);
 RETURN jsonb_build_object('id',p_id,'state','queued','queued',true);
END $$;

CREATE FUNCTION public.copy_rewrite_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE chosen public.property_copy_rewrites;
BEGIN
 DELETE FROM public.property_copy_rewrites WHERE state IN ('applied','discarded','failed') AND updated_at<now()-interval '90 days';
 UPDATE public.property_copy_rewrites SET state='failed',last_error_code='lease_exhausted',source='{}',claim_token=NULL,lease_until=NULL,updated_at=now()
 WHERE state='running' AND lease_until<now() AND attempts>=3;
 SELECT * INTO chosen FROM public.property_copy_rewrites WHERE attempts<3 AND next_attempt_at<=now()
 AND (state='queued' OR (state='running' AND lease_until<now())) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.property_copy_rewrites SET state='running',attempts=attempts+1,claim_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',updated_at=now()
 WHERE id=chosen.id RETURNING * INTO chosen;
 RETURN jsonb_build_object('id',chosen.id,'fields',chosen.fields,'instruction',chosen.instruction,'source',chosen.source,'original',chosen.original,'attempt',chosen.attempts,'token',chosen.claim_token);
END $$;

CREATE FUNCTION public.copy_rewrite_complete(p_id uuid,p_token uuid,p_result jsonb,p_generation jsonb DEFAULT NULL,p_error text DEFAULT '',p_retryable boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.property_copy_rewrites; item text;
BEGIN
 SELECT * INTO job FROM public.property_copy_rewrites WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR job.state<>'running' OR job.claim_token IS DISTINCT FROM p_token OR job.lease_until<now() THEN RETURN false; END IF;
 IF p_result IS NOT NULL THEN
  IF jsonb_typeof(p_result)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_result))<>cardinality(job.fields) THEN RAISE EXCEPTION 'rewrite_invalid'; END IF;
  FOREACH item IN ARRAY job.fields LOOP
   IF jsonb_typeof(p_result->item) IS DISTINCT FROM 'string' OR length(btrim(p_result->>item)) NOT BETWEEN 1 AND (CASE item WHEN 'subtitle' THEN 100 WHEN 'summary' THEN 4000 ELSE 18000 END) THEN RAISE EXCEPTION 'rewrite_invalid'; END IF;
  END LOOP;
  IF p_generation IS NOT NULL AND (jsonb_typeof(p_generation)<>'object' OR octet_length(p_generation::text)>1000) THEN RAISE EXCEPTION 'rewrite_invalid'; END IF;
  UPDATE public.property_copy_rewrites SET result=p_result,generation=p_generation,state='done',source='{}',last_error_code='',claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=p_id;
 ELSE
  IF p_error IS NULL OR p_error !~ '^[a-z0-9_]{1,60}$' THEN RAISE EXCEPTION 'rewrite_invalid'; END IF;
  UPDATE public.property_copy_rewrites SET state=CASE WHEN p_retryable AND job.attempts<3 THEN 'queued' ELSE 'failed' END,
   source=CASE WHEN p_retryable AND job.attempts<3 THEN source ELSE '{}'::jsonb END,
   next_attempt_at=now()+make_interval(mins=>CASE job.attempts WHEN 1 THEN 5 ELSE 15 END),last_error_code=p_error,claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=p_id;
 END IF;
 RETURN true;
END $$;

CREATE FUNCTION public.copy_rewrite_decide(p_id uuid,p_property uuid,p_revision integer,p_apply boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.property_copy_rewrites; room public.property_showrooms; content jsonb; item text;
BEGIN
 -- Same lock order as queue: room first, then job. Worker locks only job.
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft_missing'; END IF;
 SELECT * INTO job FROM public.property_copy_rewrites WHERE id=p_id AND property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'rewrite_missing'; END IF;
 IF NOT p_apply THEN
  IF job.state='applied' THEN RAISE EXCEPTION 'rewrite_not_ready'; END IF;
  UPDATE public.property_copy_rewrites SET state='discarded',source='{}',claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=p_id;
  RETURN jsonb_build_object('discarded',true);
 END IF;
 IF p_apply IS NULL OR p_revision IS NULL THEN RAISE EXCEPTION 'rewrite_invalid'; END IF;
 IF job.state='applied' AND room.revision=job.applied_revision AND p_revision=job.base_revision THEN RETURN to_jsonb(room); END IF;
 IF job.state<>'done' THEN RAISE EXCEPTION 'rewrite_not_ready'; END IF;
 IF room.revision<>p_revision OR job.base_revision<>p_revision THEN RAISE EXCEPTION 'rewrite_stale'; END IF;
 content:=room.draft_content;
 FOREACH item IN ARRAY job.fields LOOP
  IF item IN ('summary','subtitle') THEN content:=jsonb_set(content,ARRAY[item],job.result->item);
  ELSE
   IF jsonb_typeof(content->'marketing') IS DISTINCT FROM 'object' THEN content:=jsonb_set(content,'{marketing}','{}'); END IF;
   content:=jsonb_set(content,ARRAY['marketing',item],job.result->item);
  END IF;
 END LOOP;
 UPDATE public.property_showrooms SET draft_content=content,revision=revision+1 WHERE property_id=p_property RETURNING * INTO room;
 UPDATE public.property_copy_rewrites SET state='applied',applied_revision=room.revision,updated_at=now() WHERE id=p_id;
 RETURN to_jsonb(room);
END $$;
REVOKE ALL ON FUNCTION public.copy_rewrite_queue(uuid,uuid,uuid,integer,text[],text,jsonb,jsonb),public.copy_rewrite_claim(),public.copy_rewrite_complete(uuid,uuid,jsonb,jsonb,text,boolean),public.copy_rewrite_decide(uuid,uuid,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.copy_rewrite_queue(uuid,uuid,uuid,integer,text[],text,jsonb,jsonb),public.copy_rewrite_claim(),public.copy_rewrite_complete(uuid,uuid,jsonb,jsonb,text,boolean),public.copy_rewrite_decide(uuid,uuid,integer,boolean) TO service_role;
COMMIT;
