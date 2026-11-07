BEGIN;
ALTER TABLE public.property_copy_rewrites ADD COLUMN executor_kind text NOT NULL DEFAULT 'legacy_actions' CHECK(executor_kind IN ('legacy_actions','web_worker')),ADD COLUMN candidate jsonb,ADD COLUMN candidate_generation jsonb;
CREATE FUNCTION public.web_copy_rewrite_queue(p_id uuid,p_property uuid,p_actor uuid,p_revision integer,p_fields text[],p_instruction text,p_source jsonb,p_original jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE answer jsonb;
BEGIN
 answer:=public.copy_rewrite_queue(p_id,p_property,p_actor,p_revision,p_fields,p_instruction,p_source,p_original);
 IF (answer->>'queued')::boolean THEN UPDATE public.property_copy_rewrites SET executor_kind='web_worker' WHERE id=p_id; END IF;
 RETURN answer;
END $$;
CREATE FUNCTION public.copy_rewrite_claim_for(p_executor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE chosen public.property_copy_rewrites;
BEGIN
 IF p_executor IS NULL OR p_executor NOT IN ('legacy_actions','web_worker') THEN RAISE EXCEPTION 'invalid_worker'; END IF;
 DELETE FROM public.property_copy_rewrites WHERE executor_kind=p_executor AND state IN ('applied','discarded','failed') AND updated_at<now()-interval '90 days';
 UPDATE public.property_copy_rewrites SET state='failed',last_error_code=CASE WHEN p_executor='web_worker' THEN 'outcome_unknown' ELSE 'lease_exhausted' END,source='{}',claim_token=NULL,lease_until=NULL,updated_at=now()
 WHERE executor_kind=p_executor AND state='running' AND lease_until<now() AND (p_executor='web_worker' AND candidate IS NULL OR attempts>=3 AND candidate IS NULL);
 SELECT * INTO chosen FROM public.property_copy_rewrites WHERE executor_kind=p_executor AND (attempts<3 OR candidate IS NOT NULL) AND next_attempt_at<=now()
 AND (state='queued' OR (state='running' AND lease_until<now())) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.property_copy_rewrites SET state='running',attempts=LEAST(attempts+1,3),claim_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',updated_at=now() WHERE id=chosen.id RETURNING * INTO chosen;
 RETURN jsonb_build_object('id',chosen.id,'fields',chosen.fields,'instruction',chosen.instruction,'source',chosen.source,'original',chosen.original,'attempt',chosen.attempts,'token',chosen.claim_token,'candidate',chosen.candidate,'candidate_generation',chosen.candidate_generation);
END $$;
CREATE OR REPLACE FUNCTION public.copy_rewrite_claim() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT public.copy_rewrite_claim_for('legacy_actions') $$;
CREATE FUNCTION public.web_copy_rewrite_claim() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT public.copy_rewrite_claim_for('web_worker') $$;
CREATE FUNCTION public.web_copy_rewrite_candidate(p_id uuid,p_token uuid,p_result jsonb,p_generation jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.property_copy_rewrites;
BEGIN
 SELECT * INTO job FROM public.property_copy_rewrites WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR job.executor_kind<>'web_worker' OR job.state<>'running' OR job.claim_token IS DISTINCT FROM p_token OR job.lease_until<now() THEN RETURN false; END IF;
 IF jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR octet_length(p_result::text)>250000 OR job.candidate IS NOT NULL AND job.candidate IS DISTINCT FROM p_result THEN RAISE EXCEPTION 'rewrite_invalid'; END IF;
 UPDATE public.property_copy_rewrites SET candidate=p_result,candidate_generation=p_generation,updated_at=now() WHERE id=p_id;
 RETURN true;
END $$;

ALTER TABLE public.property_image_jobs ADD COLUMN executor_kind text NOT NULL DEFAULT 'legacy_actions' CHECK(executor_kind IN ('legacy_actions','web_worker')),ADD COLUMN input_snapshot jsonb;
ALTER FUNCTION public.image_claim(uuid) RENAME TO image_claim_before_web;
CREATE FUNCTION public.image_claim(p_job uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.property_image_budgets WHERE property_id=(SELECT property_id FROM public.property_image_jobs WHERE id=p_job) FOR UPDATE;
 PERFORM 1 FROM public.property_image_jobs WHERE id=p_job FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.property_image_jobs WHERE id=p_job AND executor_kind='legacy_actions') THEN RETURN NULL; END IF;
 RETURN public.image_claim_before_web(p_job);
END $$;
CREATE FUNCTION public.web_image_claim(p_job uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.property_image_budgets WHERE property_id=(SELECT property_id FROM public.property_image_jobs WHERE id=p_job) FOR UPDATE;
 PERFORM 1 FROM public.property_image_jobs WHERE id=p_job FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.property_image_jobs WHERE id=p_job AND executor_kind='web_worker') THEN RETURN NULL; END IF;
 RETURN public.image_claim_before_web(p_job);
END $$;
CREATE FUNCTION public.web_image_enqueue(p_property uuid,p_slot text DEFAULT 'hero',p_retry boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;room public.property_showrooms;
BEGIN
 -- Existing budget -> job -> room ordering is maintained.
 result:=public.image_enqueue(p_property,p_slot,p_retry);
 IF result->>'state'='running' THEN RAISE EXCEPTION 'concept_image_busy'; END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF result->>'state'='queued' THEN
  UPDATE public.property_image_jobs SET executor_kind='web_worker',input_snapshot=room.draft_content WHERE id=(result->>'id')::uuid RETURNING to_jsonb(property_image_jobs) INTO result;
 END IF;
 RETURN result;
END $$;

CREATE TABLE public.property_web_plan_requests(id uuid PRIMARY KEY,property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,asset_id uuid NOT NULL REFERENCES public.property_assets(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.property_web_plan_requests ENABLE ROW LEVEL SECURITY;ALTER TABLE public.property_web_plan_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_web_plan_requests FROM PUBLIC,anon,authenticated;GRANT SELECT,INSERT ON public.property_web_plan_requests TO service_role;
CREATE FUNCTION public.web_queue_plan(p_property uuid,p_asset uuid,p_revision integer,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE room public.property_showrooms;
BEGIN
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft_missing'; END IF;
 IF p_revision IS NULL OR room.revision<>p_revision THEN RAISE EXCEPTION 'revision_conflict'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.property_assets WHERE id=p_asset AND property_id=p_property AND kind='provided_plan' AND source_type<>'ai_generated' AND bucket_id='showroom-private-media') THEN RAISE EXCEPTION 'plan_asset_missing'; END IF;
 IF room.draft_content->'planAnalysis'->>'state' IN ('queued','running') THEN RAISE EXCEPTION 'plan_already_running'; END IF;
 IF (SELECT count(*) FROM public.property_web_plan_requests WHERE property_id=p_property AND created_at>now()-interval '1 hour')>=3 THEN RAISE EXCEPTION 'processing_rate_limited'; END IF;
 INSERT INTO public.property_web_plan_requests(id,property_id,asset_id) VALUES(p_request,p_property,p_asset);
 UPDATE public.property_showrooms SET draft_content=jsonb_set(draft_content,'{planAnalysis}',jsonb_build_object('assetId',p_asset,'state','queued','attempts',0,'requestId',p_request,'executorKind','web_worker','queuedAt',now())),revision=revision+1 WHERE property_id=p_property RETURNING * INTO room;
 RETURN to_jsonb(room);
END $$;
REVOKE ALL ON FUNCTION public.web_copy_rewrite_queue(uuid,uuid,uuid,integer,text[],text,jsonb,jsonb),public.copy_rewrite_claim_for(text),public.web_copy_rewrite_claim(),public.web_copy_rewrite_candidate(uuid,uuid,jsonb,jsonb),public.image_claim_before_web(uuid),public.image_claim(uuid),public.web_image_claim(uuid),public.web_image_enqueue(uuid,text,boolean),public.web_queue_plan(uuid,uuid,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.web_copy_rewrite_queue(uuid,uuid,uuid,integer,text[],text,jsonb,jsonb),public.copy_rewrite_claim_for(text),public.web_copy_rewrite_claim(),public.web_copy_rewrite_candidate(uuid,uuid,jsonb,jsonb),public.image_claim_before_web(uuid),public.image_claim(uuid),public.web_image_claim(uuid),public.web_image_enqueue(uuid,text,boolean),public.web_queue_plan(uuid,uuid,integer,uuid) TO service_role;
COMMIT;
