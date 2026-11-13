-- Image budget: 250 KRW is reserved per image request instead of 500 KRW, so the unchanged
-- 2,500 KRW per-listing limit allows 10 requests (owner decision 2026-11-12).
-- Measured production usage (8 images, gemini-3.1-flash-image, 1K): up to 1,864 output tokens,
-- 160-199 KRW by the worker's estimate. image_worker.py caps output at 2,250 tokens so a request
-- can never be estimated above 245 KRW. Only the budget expressions below change; every function
-- body is otherwise identical to its current definition.
BEGIN;

CREATE OR REPLACE FUNCTION public.image_claim_before_web(p_job uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE b public.property_image_budgets;j public.property_image_jobs;pid uuid;
BEGIN
 SELECT property_id INTO pid FROM public.property_image_jobs WHERE id=p_job;
 IF pid IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO b FROM public.property_image_budgets WHERE property_id=pid FOR UPDATE;
 SELECT * INTO j FROM public.property_image_jobs WHERE id=p_job FOR UPDATE;
 IF j.state<>'queued' THEN RETURN NULL;END IF;
 IF b.reserved_krw+250>b.limit_krw THEN
  UPDATE public.property_image_jobs SET state='budget_blocked',last_error_code='budget_limit',updated_at=now() WHERE id=p_job;RETURN NULL;
 END IF;
 UPDATE public.property_image_budgets SET reserved_krw=reserved_krw+250 WHERE property_id=pid;
 UPDATE public.property_image_jobs SET state='running',attempts=attempts+1,claim_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',updated_at=now() WHERE id=p_job RETURNING * INTO j;
 RETURN to_jsonb(j);
END $function$;

CREATE OR REPLACE FUNCTION public.image_enqueue_before_manual(p_property uuid, p_slot text DEFAULT 'hero'::text, p_retry boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE b public.property_image_budgets;j public.property_image_jobs;
BEGIN
 IF p_slot NOT IN ('hero','concept-1','concept-2','concept-3') THEN RAISE EXCEPTION 'invalid_slot';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.property_showrooms WHERE property_id=p_property) THEN RAISE EXCEPTION 'draft_missing';END IF;
 IF p_slot<>'hero' AND NOT EXISTS(SELECT 1 FROM public.property_showrooms s,jsonb_array_elements(s.draft_content->'concepts') c WHERE s.property_id=p_property AND c->>'id'=p_slot) THEN RAISE EXCEPTION 'concept_missing';END IF;
 INSERT INTO public.property_image_budgets(property_id) VALUES(p_property) ON CONFLICT DO NOTHING;
 SELECT * INTO b FROM public.property_image_budgets WHERE property_id=p_property FOR UPDATE;
 INSERT INTO public.property_image_jobs(property_id,slot) VALUES(p_property,p_slot) ON CONFLICT DO NOTHING;
 SELECT * INTO j FROM public.property_image_jobs WHERE property_id=p_property AND slot=p_slot FOR UPDATE;
 IF j.state='running' AND j.lease_until<now() THEN UPDATE public.property_image_jobs SET state='failed',claim_token=NULL,last_error_code='lease_expired' WHERE id=j.id RETURNING * INTO j;END IF;
 IF p_retry AND j.state IN ('failed','budget_blocked') AND b.reserved_krw+250<=b.limit_krw THEN
  UPDATE public.property_image_jobs SET state='queued',last_error_code='',updated_at=now() WHERE id=j.id RETURNING * INTO j;
 END IF;
 RETURN to_jsonb(j);
END $function$;

CREATE OR REPLACE FUNCTION public.web_automatic_apply(p_property uuid, p_actor uuid, p_run uuid, p_revision integer, p_generated jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE room public.property_showrooms;r public.property_processing_runs;slots text[];remaining integer;
BEGIN
 SELECT * INTO r FROM public.property_processing_runs WHERE id=p_run AND property_id=p_property AND requested_by=p_actor AND is_v2_submission;
 IF NOT FOUND OR r.state<>'done' OR jsonb_typeof(p_generated) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_generated))<>7
 OR p_generated->'listingBundle' IS DISTINCT FROM r.result->'listing_bundle' OR p_generated->'salesStrategy' IS DISTINCT FROM r.result->'sales_strategy'
 OR jsonb_typeof(p_generated->'concepts') IS DISTINCT FROM 'array' OR jsonb_array_length(p_generated->'concepts')>3
 OR jsonb_typeof(p_generated->'subtitle') IS DISTINCT FROM 'string' OR jsonb_typeof(p_generated->'summary') IS DISTINCT FROM 'string'
 OR length(btrim(p_generated->>'subtitle')) NOT BETWEEN 1 AND 100 OR length(btrim(p_generated->>'summary')) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'invalid_processing_result';END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property;
 SELECT limit_krw-reserved_krw INTO remaining FROM public.property_image_budgets WHERE property_id=p_property;
 -- Preserve a usable cover when the existing per-property budget is exhausted.
 SELECT ARRAY(SELECT c->>'id' FROM jsonb_array_elements(COALESCE(room.draft_content->'concepts','[]'::jsonb)) c) INTO slots;
 IF COALESCE(remaining,2500)>=250 THEN slots:=array_prepend('hero',slots);END IF;
 RETURN public.web_apply_v2_reanalysis(p_property,p_actor,p_run,p_revision,room.draft_content||p_generated,slots,true);
END $function$;

CREATE OR REPLACE FUNCTION public.web_automatic_image_enqueue(p_property uuid, p_actor uuid, p_run uuid, p_slot text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE room public.property_showrooms;j public.property_image_jobs;b public.property_image_budgets;
BEGIN
 IF p_slot IS NULL OR p_slot NOT IN ('hero','concept-1','concept-2','concept-3') THEN RAISE EXCEPTION 'invalid_slot';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.web_submission_sessions WHERE property_id=p_property AND actor_id=p_actor AND state='committed' AND prepared_run_id IS NOT NULL) THEN RAISE EXCEPTION 'draft_not_ready';END IF;
 INSERT INTO public.property_image_budgets(property_id) VALUES(p_property) ON CONFLICT DO NOTHING;
 SELECT * INTO b FROM public.property_image_budgets WHERE property_id=p_property FOR UPDATE;
 SELECT * INTO j FROM public.property_image_jobs WHERE property_id=p_property AND slot=p_slot FOR UPDATE;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF room.draft_content->'automation'->>'runId' IS DISTINCT FROM p_run::text THEN RAISE EXCEPTION 'processing_stale';END IF;
 IF p_slot<>'hero' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(room.draft_content->'concepts') c WHERE c->>'id'=p_slot) THEN RAISE EXCEPTION 'concept_missing';END IF;
 IF j.id IS NOT NULL AND (j.state='running' OR j.input_snapshot->'automation'->>'runId'=p_run::text) THEN RETURN to_jsonb(j);END IF;
 IF j.id IS NULL THEN
  INSERT INTO public.property_image_jobs(property_id,slot,executor_kind,input_snapshot,state,last_error_code)
  VALUES(p_property,p_slot,'web_worker',room.draft_content,CASE WHEN b.reserved_krw+250>b.limit_krw THEN 'budget_blocked' ELSE 'queued' END,CASE WHEN b.reserved_krw+250>b.limit_krw THEN 'budget_limit' ELSE '' END) RETURNING * INTO j;
 ELSE
  -- A completed unchanged cover may be reused; no usage reservations are reset.
  UPDATE public.property_image_jobs SET executor_kind='web_worker',input_snapshot=room.draft_content,
   state=CASE WHEN j.state='done' AND j.asset_id IS NOT NULL THEN 'done' WHEN b.reserved_krw+250>b.limit_krw OR attempts>=5 THEN 'budget_blocked' ELSE 'queued' END,
   last_error_code=CASE WHEN j.state='done' AND j.asset_id IS NOT NULL THEN '' WHEN b.reserved_krw+250>b.limit_krw OR attempts>=5 THEN 'budget_limit' ELSE '' END,updated_at=now() WHERE id=j.id RETURNING * INTO j;
 END IF;
 RETURN to_jsonb(j);
END $function$;

CREATE OR REPLACE FUNCTION public.web_retry_automatic_cover(p_property uuid, p_actor uuid, p_revision integer, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE room public.property_showrooms;j public.property_image_jobs;b public.property_image_budgets;prior public.property_web_intake_writes;fingerprint text;source_version integer;
BEGIN
 IF p_request IS NULL OR p_revision IS NULL THEN RAISE EXCEPTION 'invalid_processing_request';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.web_submission_sessions WHERE property_id=p_property AND actor_id=p_actor AND state='committed' AND prepared_run_id IS NOT NULL) THEN RAISE EXCEPTION 'draft_not_ready';END IF;
 fingerprint:=md5(jsonb_build_array('retry-automatic-cover',p_actor,p_revision)::text);
 SELECT * INTO prior FROM public.property_web_intake_writes WHERE property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.fingerprint<>fingerprint THEN RAISE EXCEPTION 'processing_request_conflict';END IF;
  RETURN jsonb_build_object('retried',true,'replayed',true);
 END IF;
 SELECT * INTO b FROM public.property_image_budgets WHERE property_id=p_property FOR UPDATE;
 SELECT * INTO j FROM public.property_image_jobs WHERE property_id=p_property AND slot='hero' FOR UPDATE;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF room.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'revision_conflict';END IF;
 IF room.draft_content->'automation'->>'version' IS DISTINCT FROM '1' OR room.draft_content ? 'heroAsset' OR j.id IS NULL OR j.state NOT IN ('failed','budget_blocked') THEN RETURN NULL;END IF;
 IF EXISTS(SELECT 1 FROM public.property_image_jobs WHERE property_id=p_property AND state IN ('queued','running')) OR EXISTS(SELECT 1 FROM public.property_processing_runs WHERE property_id=p_property AND state IN ('queued','running','done')) THEN RAISE EXCEPTION 'processing_pending';END IF;
 IF b.reserved_krw+250>b.limit_krw OR j.attempts>=5 THEN RAISE EXCEPTION 'automatic_image_budget_exhausted';END IF;
 UPDATE public.property_image_jobs SET state='queued',last_error_code='',input_snapshot=room.draft_content,updated_at=now() WHERE id=j.id;
 SELECT source_revision INTO source_version FROM public.property_web_intakes WHERE property_id=p_property;
 INSERT INTO public.property_web_intake_writes(property_id,request_id,fingerprint,applied_revision,source_revision) VALUES(p_property,p_request,fingerprint,p_revision,source_version);
 RETURN jsonb_build_object('retried',true,'replayed',false);
END $function$;

-- Existing reservations are recounted at the new rate: 250 KRW for every recorded attempt,
-- so listings created under the 500 KRW rate keep the same number of remaining requests as new ones.
UPDATE public.property_image_budgets b SET reserved_krw=LEAST(b.limit_krw,250*COALESCE((SELECT sum(j.attempts) FROM public.property_image_jobs j WHERE j.property_id=b.property_id),0));

COMMIT;
