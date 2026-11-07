BEGIN;
ALTER TABLE public.property_assets ADD COLUMN sha256 text CHECK(sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),ADD COLUMN byte_size bigint CHECK(byte_size IS NULL OR byte_size BETWEEN 1 AND 8388608);
CREATE TABLE public.property_processing_runs (
 id uuid PRIMARY KEY,property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
 requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,request_spec jsonb NOT NULL,fingerprint text NOT NULL,
 input_revision integer NOT NULL CHECK(input_revision>0),source_revision integer NOT NULL,
 input_text text NOT NULL CHECK(length(input_text) BETWEEN 1 AND 60000),document_refs jsonb NOT NULL CHECK(jsonb_typeof(document_refs)='array' AND jsonb_array_length(document_refs)<=12),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','done','failed','cancelled','applied')),
 phase text NOT NULL DEFAULT 'queued',attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 executor_epoch integer NOT NULL DEFAULT 1,worker_id uuid,
 candidate jsonb,result jsonb,previous_ai_contents jsonb,applied_revision integer,
 last_error_code text NOT NULL DEFAULT '' CHECK(length(last_error_code)<=60),
 created_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,completed_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(property_id,source_revision) REFERENCES public.property_web_input_versions(property_id,source_revision) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX web_processing_one_open ON public.property_processing_runs(property_id) WHERE state IN ('queued','running','done');
ALTER TABLE public.property_processing_runs ENABLE ROW LEVEL SECURITY;ALTER TABLE public.property_processing_runs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_processing_runs FROM PUBLIC,anon,authenticated;GRANT SELECT,INSERT,UPDATE ON public.property_processing_runs TO service_role;
ALTER TABLE public.property_analysis_jobs ADD COLUMN executor_kind text NOT NULL DEFAULT 'legacy_actions' CHECK(executor_kind IN ('legacy_actions','web_worker')),
 ADD COLUMN executor_epoch integer NOT NULL DEFAULT 1,ADD COLUMN run_id uuid REFERENCES public.property_processing_runs(id) ON DELETE RESTRICT;
CREATE TABLE public.web_worker_heartbeats (
 worker_id uuid PRIMARY KEY,version text NOT NULL,environment text NOT NULL CHECK(environment IN ('test','staging','production')),
 capabilities text[] NOT NULL,current_run uuid,last_seen timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.web_worker_heartbeats ENABLE ROW LEVEL SECURITY;ALTER TABLE public.web_worker_heartbeats FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_worker_heartbeats FROM PUBLIC,anon,authenticated;GRANT SELECT,INSERT,UPDATE ON public.web_worker_heartbeats TO service_role;

CREATE FUNCTION public.web_worker_heartbeat(p_worker uuid,p_version text,p_environment text,p_capabilities text[],p_run uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_worker IS NULL OR p_version IS NULL OR p_version !~ '^[a-zA-Z0-9._-]{1,80}$' OR p_environment IS NULL OR p_environment NOT IN ('test','staging','production')
 OR p_capabilities IS NULL OR cardinality(p_capabilities) NOT BETWEEN 1 AND 4 OR NOT p_capabilities<@ARRAY['analysis','plan','rewrite','image']::text[] THEN RAISE EXCEPTION 'invalid_worker'; END IF;
 INSERT INTO public.web_worker_heartbeats(worker_id,version,environment,capabilities,current_run) VALUES(p_worker,p_version,p_environment,p_capabilities,p_run)
 ON CONFLICT(worker_id) DO UPDATE SET version=EXCLUDED.version,environment=EXCLUDED.environment,capabilities=EXCLUDED.capabilities,current_run=EXCLUDED.current_run,last_seen=now();
END $$;

CREATE FUNCTION public.web_processing_receipt(p_property uuid,p_actor uuid,p_request uuid,p_spec jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous public.property_processing_runs;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.property_web_intakes WHERE property_id=p_property AND created_by=p_actor) THEN RAISE EXCEPTION 'web_intake_missing'; END IF;
 SELECT * INTO previous FROM public.property_processing_runs WHERE id=p_request AND property_id=p_property AND requested_by=p_actor;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF previous.fingerprint<>md5(jsonb_build_array(p_actor,p_property,p_spec)::text) THEN RAISE EXCEPTION 'processing_request_conflict'; END IF;
 RETURN jsonb_build_object('runId',previous.id,'queued',false,'state',previous.state);
END $$;

CREATE FUNCTION public.web_queue_processing(p_property uuid,p_actor uuid,p_request uuid,p_revision integer,p_source_revision integer,p_spec jsonb,p_raw text,p_documents jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE intake public.property_web_intakes;room public.property_showrooms;job public.property_analysis_jobs;previous jsonb;epoch integer;
BEGIN
 IF p_request IS NULL OR p_revision IS NULL OR p_revision<1 OR p_revision>=2147483647 OR p_source_revision IS NULL OR p_source_revision<1
 OR jsonb_typeof(p_spec) IS DISTINCT FROM 'object' OR p_raw IS NULL OR length(p_raw) NOT BETWEEN 1 AND 60000
 OR jsonb_typeof(p_documents) IS DISTINCT FROM 'array' OR jsonb_array_length(p_documents)>12 THEN RAISE EXCEPTION 'invalid_processing_request'; END IF;
 IF p_spec->>'draftRevision' IS DISTINCT FROM p_revision::text OR p_spec->>'sourceRevision' IS DISTINCT FROM p_source_revision::text THEN RAISE EXCEPTION 'invalid_processing_request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('web-run:'||p_request,0));
 previous:=public.web_processing_receipt(p_property,p_actor,p_request,p_spec);IF previous IS NOT NULL THEN RETURN previous; END IF;
 SELECT * INTO intake FROM public.property_web_intakes WHERE property_id=p_property AND created_by=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'web_intake_missing'; END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft_missing'; END IF;
 IF NOT intake.form_closed THEN RAISE EXCEPTION 'web_form_open'; END IF;
 IF room.revision<>p_revision OR intake.source_revision<>p_source_revision THEN RAISE EXCEPTION 'revision_conflict'; END IF;
 IF intake.input_payload IS NULL OR room.draft_content->'registration'->>'rightsApproved' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'web_source_required'; END IF;
 SELECT * INTO job FROM public.property_analysis_jobs WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'web_intake_missing'; END IF;
 IF job.state='running' THEN RAISE EXCEPTION 'analysis_already_running'; END IF;
 IF EXISTS(SELECT 1 FROM public.property_processing_runs WHERE property_id=p_property AND state IN ('queued','running','done')) THEN RAISE EXCEPTION 'processing_pending'; END IF;
 IF (SELECT count(*) FROM public.property_processing_runs WHERE property_id=p_property AND created_at>now()-interval '1 hour')>=3 THEN RAISE EXCEPTION 'processing_rate_limited'; END IF;
 epoch:=job.executor_epoch+1;
 INSERT INTO public.property_processing_runs(id,property_id,requested_by,request_spec,fingerprint,input_revision,source_revision,input_text,document_refs,executor_epoch)
 VALUES(p_request,p_property,p_actor,p_spec,md5(jsonb_build_array(p_actor,p_property,p_spec)::text),p_revision,p_source_revision,p_raw,p_documents,epoch);
 UPDATE public.property_analysis_jobs SET executor_kind='web_worker',executor_epoch=epoch,run_id=p_request,state='waiting',attempts=0,next_attempt_at=now(),claim_token=NULL,lease_until=NULL,last_error_code='',updated_at=now() WHERE property_id=p_property;
 UPDATE public.property_web_intakes SET state='queued' WHERE property_id=p_property;
 UPDATE public.properties SET status='pending' WHERE id=p_property;
 RETURN jsonb_build_object('runId',p_request,'queued',true,'state','queued');
END $$;

-- The legacy entry point now owns legacy rows only. Existing token/result
-- completion stays compatible; running legacy work is never reassigned.
CREATE OR REPLACE FUNCTION public.analysis_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE chosen uuid;claimed public.property_analysis_jobs;
BEGIN
 INSERT INTO public.property_analysis_jobs(property_id) SELECT id FROM public.properties WHERE status='pending' ON CONFLICT DO NOTHING;
 UPDATE public.property_analysis_jobs SET state='failed',last_error_code='lease_exhausted',claim_token=NULL,lease_until=NULL,updated_at=now()
 WHERE executor_kind='legacy_actions' AND state='running' AND lease_until<now() AND attempts>=5;
 SELECT q.property_id INTO chosen FROM public.property_analysis_jobs q JOIN public.properties p ON p.id=q.property_id
 WHERE q.executor_kind='legacy_actions' AND p.status='pending' AND q.attempts<5 AND q.next_attempt_at<=now()
 AND (q.state='waiting' OR (q.state='running' AND q.lease_until<now()))
 ORDER BY (p.raw_input LIKE '%[FILE_ID:%'),p.created_at LIMIT 1 FOR UPDATE OF q SKIP LOCKED;
 IF chosen IS NULL THEN RETURN NULL; END IF;
 UPDATE public.property_analysis_jobs SET state='running',attempts=attempts+1,claim_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',updated_at=now() WHERE property_id=chosen RETURNING * INTO claimed;
 RETURN (SELECT jsonb_build_object('id',p.id,'raw_input',p.raw_input,'attempt',claimed.attempts,'token',claimed.claim_token) FROM public.properties p WHERE p.id=chosen);
END $$;

CREATE FUNCTION public.web_analysis_claim(p_worker uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.property_analysis_jobs;run public.property_processing_runs;
BEGIN
 IF p_worker IS NULL THEN RAISE EXCEPTION 'invalid_worker'; END IF;
 -- A process lost while an external request was in progress has an uncertain
 -- paid outcome. Require explicit review rather than blindly calling again.
 FOR job IN SELECT * FROM public.property_analysis_jobs WHERE executor_kind='web_worker' AND state='running' AND lease_until<now() LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  SELECT * INTO run FROM public.property_processing_runs WHERE id=job.run_id FOR UPDATE;
  IF FOUND AND run.state='running' AND run.candidate IS NULL AND (run.phase='generating' OR job.attempts>=5) THEN
   UPDATE public.property_processing_runs SET state='failed',phase='failed',last_error_code=CASE WHEN run.phase='generating' THEN 'outcome_unknown' ELSE 'lease_exhausted' END,updated_at=now() WHERE id=run.id RETURNING * INTO run;
   UPDATE public.property_analysis_jobs SET state='failed',last_error_code=run.last_error_code,claim_token=NULL,lease_until=NULL,updated_at=now() WHERE property_id=job.property_id;
  END IF;
 END LOOP;
 SELECT j.* INTO job FROM public.property_analysis_jobs j JOIN public.property_processing_runs r ON r.id=j.run_id
 WHERE j.executor_kind='web_worker' AND j.executor_epoch=r.executor_epoch AND r.state IN ('queued','running') AND j.next_attempt_at<=now()
 AND (j.attempts<5 OR r.candidate IS NOT NULL) AND (j.state='waiting' OR (j.state='running' AND j.lease_until<now()))
 ORDER BY r.created_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO run FROM public.property_processing_runs WHERE id=job.run_id FOR UPDATE;
 UPDATE public.property_analysis_jobs SET state='running',attempts=LEAST(attempts+1,5),claim_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',updated_at=now() WHERE property_id=job.property_id RETURNING * INTO job;
 UPDATE public.property_processing_runs SET state='running',phase=CASE WHEN candidate IS NOT NULL THEN 'saving' ELSE 'reading' END,attempts=job.attempts,worker_id=p_worker,started_at=COALESCE(started_at,now()),updated_at=now() WHERE id=run.id RETURNING * INTO run;
 RETURN jsonb_build_object('id',job.property_id,'run_id',run.id,'token',job.claim_token,'attempt',job.attempts,'raw_input',run.input_text,'documents',run.document_refs,'candidate',run.candidate,'executor_epoch',job.executor_epoch);
END $$;

CREATE FUNCTION public.web_analysis_progress(p_property uuid,p_token uuid,p_phase text,p_candidate jsonb DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.property_analysis_jobs;run public.property_processing_runs;
BEGIN
 SELECT * INTO job FROM public.property_analysis_jobs WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND OR job.executor_kind<>'web_worker' OR job.state<>'running' OR job.claim_token IS DISTINCT FROM p_token OR job.lease_until<now() THEN RETURN false; END IF;
 SELECT * INTO run FROM public.property_processing_runs WHERE id=job.run_id FOR UPDATE;
 IF NOT FOUND OR run.state<>'running' OR run.executor_epoch<>job.executor_epoch OR p_phase IS NULL OR p_phase NOT IN ('reading','generating','saving','heartbeat') THEN RETURN false; END IF;
 IF run.phase='saving' AND p_phase NOT IN ('saving','heartbeat') THEN RETURN false; END IF;
 IF run.phase='generating' AND p_phase='reading' THEN RETURN false; END IF;
 IF p_candidate IS NOT NULL AND (p_phase<>'saving' OR jsonb_typeof(p_candidate)<>'object' OR length(p_candidate::text)>200000
  OR jsonb_typeof(p_candidate->'usp_summary') IS DISTINCT FROM 'string' OR jsonb_typeof(p_candidate->'landing_copy') IS DISTINCT FROM 'string' OR jsonb_typeof(p_candidate->'showroom_concepts') IS DISTINCT FROM 'array'
  OR run.candidate IS NOT NULL AND run.candidate IS DISTINCT FROM p_candidate) THEN RAISE EXCEPTION 'invalid_processing_result'; END IF;
 IF run.started_at<now()-interval '30 minutes' THEN RETURN false; END IF;
 UPDATE public.property_analysis_jobs SET lease_until=now()+interval '10 minutes',updated_at=now() WHERE property_id=p_property;
 UPDATE public.property_processing_runs SET phase=CASE WHEN p_phase='heartbeat' THEN phase ELSE p_phase END,candidate=COALESCE(p_candidate,candidate),updated_at=now() WHERE id=run.id;
 RETURN true;
END $$;

CREATE FUNCTION public.web_analysis_complete(p_property uuid,p_token uuid,p_result jsonb,p_error text DEFAULT '',p_retryable boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.property_analysis_jobs;run public.property_processing_runs;
BEGIN
 SELECT * INTO job FROM public.property_analysis_jobs WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND OR job.executor_kind<>'web_worker' OR job.state<>'running' OR job.claim_token IS DISTINCT FROM p_token OR job.lease_until<now() THEN RETURN false; END IF;
 SELECT * INTO run FROM public.property_processing_runs WHERE id=job.run_id FOR UPDATE;
 IF NOT FOUND OR run.state<>'running' OR run.executor_epoch<>job.executor_epoch THEN RETURN false; END IF;
 IF p_result IS NOT NULL THEN
  IF jsonb_typeof(p_result)<>'object' OR length(p_result::text)>200000 OR jsonb_typeof(p_result->'usp_summary') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_result->'landing_copy') IS DISTINCT FROM 'string' OR jsonb_typeof(p_result->'showroom_concepts') IS DISTINCT FROM 'array'
  OR run.candidate IS NOT NULL AND run.candidate IS DISTINCT FROM p_result THEN RAISE EXCEPTION 'invalid_processing_result'; END IF;
  UPDATE public.property_processing_runs SET state='done',phase='result_ready',result=p_result,candidate=NULL,last_error_code='',completed_at=now(),updated_at=now() WHERE id=run.id;
  UPDATE public.property_analysis_jobs SET state='done',claim_token=NULL,lease_until=NULL,last_error_code='',updated_at=now() WHERE property_id=p_property;
 ELSE
  IF p_error IS NULL OR p_error !~ '^[a-z0-9_]{1,60}$' THEN RAISE EXCEPTION 'invalid_processing_result'; END IF;
  UPDATE public.property_processing_runs SET state=CASE WHEN p_retryable AND job.attempts<5 THEN 'queued' ELSE 'failed' END,
   phase=CASE WHEN p_retryable AND job.attempts<5 THEN 'retry_wait' ELSE 'failed' END,last_error_code=p_error,updated_at=now() WHERE id=run.id;
  UPDATE public.property_analysis_jobs SET state=CASE WHEN p_retryable AND job.attempts<5 THEN 'waiting' ELSE 'failed' END,
   next_attempt_at=now()+make_interval(mins=>CASE job.attempts WHEN 1 THEN 5 WHEN 2 THEN 15 WHEN 3 THEN 30 ELSE 60 END),claim_token=NULL,lease_until=NULL,last_error_code=p_error,updated_at=now() WHERE property_id=p_property;
 END IF;
 RETURN true;
END $$;

CREATE FUNCTION public.web_cancel_processing(p_property uuid,p_actor uuid,p_run uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.property_analysis_jobs;run public.property_processing_runs;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.property_web_intakes WHERE property_id=p_property AND created_by=p_actor) THEN RAISE EXCEPTION 'web_intake_missing'; END IF;
 SELECT * INTO job FROM public.property_analysis_jobs WHERE property_id=p_property FOR UPDATE;
 SELECT * INTO run FROM public.property_processing_runs WHERE id=p_run AND property_id=p_property AND requested_by=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'processing_missing'; END IF;
 IF run.state='applied' THEN RAISE EXCEPTION 'processing_not_ready'; END IF;
 UPDATE public.property_processing_runs SET state='cancelled',phase='cancelled',candidate=NULL,last_error_code='cancelled',updated_at=now() WHERE id=p_run;
 IF job.run_id=p_run THEN UPDATE public.property_analysis_jobs SET state='failed',claim_token=NULL,lease_until=NULL,last_error_code='cancelled',updated_at=now() WHERE property_id=p_property; END IF;
 RETURN jsonb_build_object('cancelled',true);
END $$;

CREATE FUNCTION public.web_apply_processing(p_property uuid,p_actor uuid,p_run uuid,p_revision integer,p_content jsonb,p_slots text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE intake public.property_web_intakes;room public.property_showrooms;run public.property_processing_runs;saved jsonb;old_ai jsonb;
BEGIN
 IF cardinality(p_slots)>0 THEN
  -- Same ordering as the existing concept editor/image worker: budgets/jobs
  -- before the showroom. Do not acquire these after holding the room lock.
  IF to_regclass('public.property_image_jobs') IS NULL THEN RAISE EXCEPTION 'processing_dependency_missing'; END IF;
  EXECUTE 'SELECT 1 FROM public.property_image_budgets WHERE property_id=$1 FOR UPDATE' USING p_property;
  EXECUTE 'SELECT 1 FROM public.property_image_jobs WHERE property_id=$1 AND slot=ANY($2) ORDER BY id FOR UPDATE' USING p_property,p_slots;
 END IF;
 SELECT * INTO intake FROM public.property_web_intakes WHERE property_id=p_property AND created_by=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'web_intake_missing'; END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft_missing'; END IF;
 SELECT * INTO run FROM public.property_processing_runs WHERE id=p_run AND property_id=p_property AND requested_by=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'processing_missing'; END IF;
 IF run.state='applied' AND p_revision=run.input_revision AND room.revision=run.applied_revision THEN RETURN to_jsonb(room); END IF;
 IF run.state<>'done' THEN RAISE EXCEPTION 'processing_not_ready'; END IF;
 IF p_revision IS NULL OR room.revision<>p_revision OR run.input_revision<>p_revision OR intake.source_revision<>run.source_revision THEN RAISE EXCEPTION 'processing_stale'; END IF;
 IF jsonb_typeof(p_content) IS DISTINCT FROM 'object' OR p_slots IS NULL OR NOT p_slots<@ARRAY['hero','concept-1','concept-2','concept-3']::text[] THEN RAISE EXCEPTION 'invalid_processing_result'; END IF;
 IF cardinality(p_slots)>0 THEN
  IF to_regprocedure('public.showroom_save_concept_draft(uuid,integer,jsonb,text[])') IS NULL THEN RAISE EXCEPTION 'processing_dependency_missing'; END IF;
  EXECUTE 'SELECT public.showroom_save_concept_draft($1,$2,$3,$4)' INTO saved USING p_property,p_revision,p_content,p_slots;
 ELSE
  UPDATE public.property_showrooms SET draft_content=p_content,revision=revision+1 WHERE property_id=p_property RETURNING * INTO room;
  saved:=to_jsonb(room);
 END IF;
 SELECT ai_contents INTO old_ai FROM public.properties WHERE id=p_property FOR UPDATE;
 UPDATE public.properties SET ai_contents=run.result,status='analyzed' WHERE id=p_property;
 UPDATE public.property_processing_runs SET state='applied',phase='applied',previous_ai_contents=old_ai,applied_revision=(saved->>'revision')::integer,updated_at=now() WHERE id=p_run;
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.web_worker_heartbeat(uuid,text,text,text[],uuid),public.web_processing_receipt(uuid,uuid,uuid,jsonb),public.web_queue_processing(uuid,uuid,uuid,integer,integer,jsonb,text,jsonb),public.web_analysis_claim(uuid),public.web_analysis_progress(uuid,uuid,text,jsonb),public.web_analysis_complete(uuid,uuid,jsonb,text,boolean),public.web_cancel_processing(uuid,uuid,uuid),public.web_apply_processing(uuid,uuid,uuid,integer,jsonb,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.web_worker_heartbeat(uuid,text,text,text[],uuid),public.web_processing_receipt(uuid,uuid,uuid,jsonb),public.web_queue_processing(uuid,uuid,uuid,integer,integer,jsonb,text,jsonb),public.web_analysis_claim(uuid),public.web_analysis_progress(uuid,uuid,text,jsonb),public.web_analysis_complete(uuid,uuid,jsonb,text,boolean),public.web_cancel_processing(uuid,uuid,uuid),public.web_apply_processing(uuid,uuid,uuid,integer,jsonb,text[]) TO service_role;
COMMIT;
