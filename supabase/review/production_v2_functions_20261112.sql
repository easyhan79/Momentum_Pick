-- Production-only function definitions exported from Supabase project aklcylhqslgntkgloqpi on 2026-11-12
-- (SQL Editor: pg_get_functiondef). REFERENCE ONLY - NOT A MIGRATION.
-- These functions depend on objects that are missing from supabase/migrations:
--   tables web_submission_sessions, property_editor_versions; function web_apply_v2_reanalysis;
--   property_processing_runs columns is_v2_submission, prepared_run_id (and result/automation usage).
-- Applying this file to a fresh database fails until those objects are recovered.
-- Image budget: web_automatic_apply and web_automatic_image_enqueue hard-code 500 KRW per image.

-- web_automatic_apply
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
 IF COALESCE(remaining,2500)>=500 THEN slots:=array_prepend('hero',slots);END IF;
 RETURN public.web_apply_v2_reanalysis(p_property,p_actor,p_run,p_revision,room.draft_content||p_generated,slots,true);
END $function$;

-- web_automatic_image_enqueue
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
  VALUES(p_property,p_slot,'web_worker',room.draft_content,CASE WHEN b.reserved_krw+500>b.limit_krw THEN 'budget_blocked' ELSE 'queued' END,CASE WHEN b.reserved_krw+500>b.limit_krw THEN 'budget_limit' ELSE '' END) RETURNING * INTO j;
 ELSE
  -- A completed unchanged cover may be reused; no usage reservations are reset.
  UPDATE public.property_image_jobs SET executor_kind='web_worker',input_snapshot=room.draft_content,
   state=CASE WHEN j.state='done' AND j.asset_id IS NOT NULL THEN 'done' WHEN b.reserved_krw+500>b.limit_krw OR attempts>=5 THEN 'budget_blocked' ELSE 'queued' END,
   last_error_code=CASE WHEN j.state='done' AND j.asset_id IS NOT NULL THEN '' WHEN b.reserved_krw+500>b.limit_krw OR attempts>=5 THEN 'budget_limit' ELSE '' END,updated_at=now() WHERE id=j.id RETURNING * INTO j;
 END IF;
 RETURN to_jsonb(j);
END $function$;

-- web_automatic_next
CREATE OR REPLACE FUNCTION public.web_automatic_next()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
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
$function$;

-- web_save_editor_v2
CREATE OR REPLACE FUNCTION public.web_save_editor_v2(p_property uuid, p_actor uuid, p_revision integer, p_content jsonb, p_slots text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE session public.web_submission_sessions;intake public.property_web_intakes;room public.property_showrooms;saved jsonb;old_slots jsonb;new_slots jsonb;changed_slots text[];entry record;
BEGIN
 IF p_property IS NULL OR p_actor IS NULL OR p_revision IS NULL OR p_revision<1 OR p_revision>=2147483647 OR jsonb_typeof(p_content) IS DISTINCT FROM 'object' OR length(p_content::text)>200000 OR p_slots IS NULL OR cardinality(p_slots)>7 THEN RAISE EXCEPTION 'invalid_editor_draft';END IF;
 SELECT * INTO session FROM public.web_submission_sessions WHERE property_id=p_property AND state='committed' FOR UPDATE;
 IF FOUND AND (session.actor_id<>p_actor OR session.prepared_run_id IS NULL) THEN RAISE EXCEPTION 'draft_not_ready';END IF;
 SELECT * INTO intake FROM public.property_web_intakes WHERE property_id=p_property;
 IF FOUND AND intake.created_by<>p_actor THEN RAISE EXCEPTION 'submission_not_found';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('manual-image:'||p_property,0));
 PERFORM 1 FROM public.property_image_budgets WHERE property_id=p_property FOR UPDATE;
 PERFORM 1 FROM public.property_image_jobs WHERE property_id=p_property ORDER BY id FOR UPDATE;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft_missing';END IF;
 IF room.revision<>p_revision THEN RAISE EXCEPTION 'revision_conflict';END IF;
 old_slots:=COALESCE(room.draft_content->'imagePolicy'->'manualSlots','{}'::jsonb);new_slots:=COALESCE(p_content->'imagePolicy'->'manualSlots','{}'::jsonb);
 IF jsonb_typeof(old_slots) IS DISTINCT FROM 'object' OR jsonb_typeof(new_slots) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(new_slots))>4 THEN RAISE EXCEPTION 'invalid_slot';END IF;
 FOR entry IN SELECT key,value FROM jsonb_each_text(new_slots) LOOP
  IF entry.key NOT IN ('hero','concept-1','concept-2','concept-3') OR entry.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR entry.key<>'hero' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p_content->'concepts','[]'::jsonb)) c WHERE c->>'id'=entry.key)
  OR NOT EXISTS(SELECT 1 FROM public.property_assets WHERE id=entry.value::uuid AND property_id=p_property AND source_type='ai_generated' AND kind='concept' AND ai_metadata->>'rightsApproved'='true' AND bucket_id='showroom-private-media') THEN RAISE EXCEPTION 'invalid_slot';END IF;
 END LOOP;
 IF (SELECT count(DISTINCT value) FROM jsonb_each_text(new_slots))<>(SELECT count(*) FROM jsonb_each_text(new_slots)) THEN RAISE EXCEPTION 'manual_image_already_selected';END IF;
 SELECT COALESCE(array_agg(key),'{}'::text[]) INTO changed_slots FROM (SELECT key FROM jsonb_object_keys(old_slots||new_slots) key WHERE old_slots->>key IS DISTINCT FROM new_slots->>key) changed;
 IF EXISTS(SELECT 1 FROM public.property_image_jobs WHERE property_id=p_property AND slot=ANY(changed_slots||p_slots) AND state='running') THEN RAISE EXCEPTION 'concept_image_busy';END IF;
 INSERT INTO public.property_editor_versions(property_id,revision,content,recorded_by) VALUES(p_property,room.revision,room.draft_content,p_actor) ON CONFLICT DO NOTHING;
 IF EXISTS(SELECT 1 FROM public.property_editor_versions WHERE property_id=p_property AND revision=room.revision AND content IS DISTINCT FROM room.draft_content) THEN RAISE EXCEPTION 'editor_history_conflict';END IF;
 IF cardinality(p_slots)>0 THEN
  saved:=public.showroom_save_concept_draft(p_property,p_revision,p_content,p_slots);
  -- The legacy concept editor clears manual selections when invalidating
  -- generated images. V2 keeps an explicitly selected image, while still
  -- invalidating old image jobs, and resynchronizes it in this transaction.
  IF new_slots ?| p_slots THEN
   UPDATE public.property_showrooms SET draft_content=jsonb_set(draft_content,'{imagePolicy,manualSlots}',new_slots,true) WHERE property_id=p_property;
   SELECT ARRAY(SELECT DISTINCT slot FROM unnest(changed_slots||p_slots) slot WHERE new_slots ? slot OR slot=ANY(changed_slots)) INTO changed_slots;
  END IF;
 ELSE UPDATE public.property_showrooms SET draft_content=p_content,revision=revision+1 WHERE property_id=p_property RETURNING to_jsonb(property_showrooms.*) INTO saved;END IF;
 IF cardinality(changed_slots)>0 THEN
  UPDATE public.property_image_jobs SET state='failed',claim_token=NULL,lease_until=NULL,last_error_code='manual_selected',updated_at=now() WHERE property_id=p_property AND slot=ANY(changed_slots) AND state='queued' AND new_slots ? slot;
  PERFORM public.image_sync_assets(p_property);
  -- The legacy synchronizer increments its own revision. This transaction
  -- represents one editor save, so publish only the single final revision.
  UPDATE public.property_showrooms SET revision=p_revision+1 WHERE property_id=p_property RETURNING to_jsonb(property_showrooms.*) INTO saved;
 END IF;
 INSERT INTO public.property_editor_versions(property_id,revision,content,recorded_by) VALUES(p_property,(saved->>'revision')::integer,saved->'draft_content',p_actor);
 RETURN saved;
END $function$;
