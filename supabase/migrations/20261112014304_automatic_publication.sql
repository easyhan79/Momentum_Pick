-- Recovered from production (supabase_migrations.schema_migrations, project aklcylhqslgntkgloqpi) on 2026-11-13.
-- Applied in production on 20261112; the original file was never committed to this repository.
BEGIN;

-- Private service-only preparation. No publication occurs in this queue.
CREATE FUNCTION public.web_automatic_next() RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('propertyId',s.property_id,'actorId',s.actor_id,'runId',r.id,'revision',room.revision,'result',r.result,'state',r.state)
 FROM public.web_submission_sessions s
 JOIN public.property_showrooms room ON room.property_id=s.property_id
 JOIN public.property_web_intakes i ON i.property_id=s.property_id AND i.created_by=s.actor_id
 JOIN LATERAL (SELECT * FROM public.property_processing_runs WHERE property_id=s.property_id AND requested_by=s.actor_id AND is_v2_submission AND state IN ('done','applied') ORDER BY created_at DESC,id DESC LIMIT 1) r ON true
 WHERE s.state='committed' AND s.prepared_run_id IS NOT NULL
 AND ((r.state='done' AND r.input_revision=room.revision AND r.source_revision=i.source_revision)
 OR (r.state='applied' AND (room.draft_content->'automation'->>'runId' IS DISTINCT FROM r.id::text
 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(jsonb_build_array('hero')||COALESCE((SELECT jsonb_agg(c->>'id') FROM jsonb_array_elements(room.draft_content->'concepts') c),'[]'::jsonb)) slot
 WHERE NOT EXISTS(SELECT 1 FROM public.property_image_jobs j WHERE j.property_id=s.property_id AND j.slot=slot AND j.input_snapshot->'automation'->>'runId'=r.id::text)))))
 AND NOT EXISTS(SELECT 1 FROM public.property_processing_runs p WHERE p.property_id=s.property_id AND p.state IN ('queued','running'))
 AND NOT EXISTS(SELECT 1 FROM public.property_image_jobs j WHERE j.property_id=s.property_id AND j.state='running')
 ORDER BY r.created_at LIMIT 1
$$;

CREATE FUNCTION public.web_automatic_apply(p_property uuid,p_actor uuid,p_run uuid,p_revision integer,p_generated jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
 IF COALESCE(remaining,2500)>=500 THEN slots:=array_prepend('hero',slots);END IF;
 RETURN public.web_apply_v2_reanalysis(p_property,p_actor,p_run,p_revision,room.draft_content||p_generated,slots,true);
END $$;

CREATE FUNCTION public.web_automatic_image_enqueue(p_property uuid,p_actor uuid,p_run uuid,p_slot text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
  VALUES(p_property,p_slot,'web_worker',room.draft_content,CASE WHEN b.reserved_krw+500>b.limit_krw THEN 'budget_blocked' ELSE 'queued' END,CASE WHEN b.reserved_krw+500>b.limit_krw THEN 'budget_limit' ELSE '' END) RETURNING * INTO j;
 ELSE
  -- A completed unchanged cover may be reused; no usage reservations are reset.
  UPDATE public.property_image_jobs SET executor_kind='web_worker',input_snapshot=room.draft_content,
   state=CASE WHEN j.state='done' AND j.asset_id IS NOT NULL THEN 'done' WHEN b.reserved_krw+500>b.limit_krw OR attempts>=5 THEN 'budget_blocked' ELSE 'queued' END,
   last_error_code=CASE WHEN j.state='done' AND j.asset_id IS NOT NULL THEN '' WHEN b.reserved_krw+500>b.limit_krw OR attempts>=5 THEN 'budget_limit' ELSE '' END,updated_at=now() WHERE id=j.id RETURNING * INTO j;
 END IF;
 RETURN to_jsonb(j);
END $$;

CREATE FUNCTION public.web_retry_automatic_cover(p_property uuid,p_actor uuid,p_revision integer,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
 IF b.reserved_krw+500>b.limit_krw OR j.attempts>=5 THEN RAISE EXCEPTION 'automatic_image_budget_exhausted';END IF;
 UPDATE public.property_image_jobs SET state='queued',last_error_code='',input_snapshot=room.draft_content,updated_at=now() WHERE id=j.id;
 SELECT source_revision INTO source_version FROM public.property_web_intakes WHERE property_id=p_property;
 INSERT INTO public.property_web_intake_writes(property_id,request_id,fingerprint,applied_revision,source_revision) VALUES(p_property,p_request,fingerprint,p_revision,source_version);
 RETURN jsonb_build_object('retried',true,'replayed',false);
END $$;

CREATE FUNCTION public.web_publish_automatic_release(p_property uuid,p_actor uuid,p_revision integer,p_request uuid,p_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE room public.property_showrooms;receipt jsonb;review jsonb:='{"mode":"automatic","inputTrust":"owner_confirmed","finalApproval":true}';
BEGIN
 receipt:=public.web_showroom_release_receipt(p_property,p_actor,p_revision,p_request,review,false);
 IF receipt IS NOT NULL THEN RETURN receipt;END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF room.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'revision_conflict';END IF;
 IF room.draft_content->'automation'->>'version' IS DISTINCT FROM '1' OR p_snapshot->'_review'->>'mode' IS DISTINCT FROM 'automatic' THEN RAISE EXCEPTION 'invalid_release';END IF;
 IF EXISTS(SELECT 1 FROM public.property_processing_runs WHERE property_id=p_property AND state IN ('queued','running','done'))
 OR EXISTS(SELECT 1 FROM public.property_image_jobs WHERE property_id=p_property AND state IN ('queued','running')) THEN RAISE EXCEPTION 'processing_pending';END IF;
 UPDATE public.property_showrooms SET showroom_status='in_review' WHERE property_id=p_property;
 -- Blog snapshots and showroom approval are committed together. A retry replays
 -- the original request before inspecting newer draft content.
 IF length(btrim(room.draft_content->'marketing'->>'target_1_blog'))>0 THEN PERFORM public.web_approve_blog_release(p_property,p_actor,'blog1',p_revision,p_request,false);END IF;
 IF length(btrim(room.draft_content->'marketing'->>'target_2_blog'))>0 THEN PERFORM public.web_approve_blog_release(p_property,p_actor,'blog2',p_revision,p_request,false);END IF;
 RETURN public.web_publish_v2_release(p_property,p_actor,p_revision,p_request,p_snapshot,review,false);
END $$;

CREATE OR REPLACE FUNCTION public.web_reserve_worker_dispatch(p_property uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT (EXISTS(SELECT 1 FROM public.property_analysis_jobs j JOIN public.property_processing_runs r ON r.id=j.run_id
 WHERE j.property_id=p_property AND j.executor_kind='web_worker' AND j.state='waiting' AND j.next_attempt_at<=now() AND j.executor_epoch=r.executor_epoch AND r.is_v2_submission AND r.state IN ('queued','running') AND (j.attempts<5 OR r.candidate IS NOT NULL))
 OR EXISTS(SELECT 1 FROM public.property_image_jobs WHERE property_id=p_property AND executor_kind='web_worker' AND state='queued' AND input_snapshot->'automation'->>'version'='1'))
 OR EXISTS(SELECT 1 FROM public.web_worker_heartbeats WHERE environment='production' AND 'analysis_v2'=ANY(capabilities) AND 'image'=ANY(capabilities) AND last_seen>now()-interval '60 seconds') THEN RETURN false;END IF;
 INSERT INTO public.web_worker_dispatch_leases AS lease(environment,reserved_until) VALUES('production',now()+interval '2 minutes')
 ON CONFLICT(environment) DO UPDATE SET reserved_until=EXCLUDED.reserved_until WHERE lease.reserved_until<=now();
 RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.web_automatic_next(),public.web_automatic_apply(uuid,uuid,uuid,integer,jsonb),public.web_automatic_image_enqueue(uuid,uuid,uuid,text),public.web_publish_automatic_release(uuid,uuid,integer,uuid,jsonb),public.web_retry_automatic_cover(uuid,uuid,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.web_automatic_next(),public.web_automatic_apply(uuid,uuid,uuid,integer,jsonb),public.web_automatic_image_enqueue(uuid,uuid,uuid,text),public.web_publish_automatic_release(uuid,uuid,integer,uuid,jsonb),public.web_retry_automatic_cover(uuid,uuid,integer,uuid) TO service_role;
COMMIT;
