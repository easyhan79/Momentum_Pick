-- Recovered from production (supabase_migrations.schema_migrations, project aklcylhqslgntkgloqpi) on 2026-11-13.
-- Applied in production on 20261109; the original file was never committed to this repository.
BEGIN;
ALTER TABLE public.property_assets ADD COLUMN excluded_from_analysis boolean NOT NULL DEFAULT false;
ALTER TABLE public.property_processing_runs ADD COLUMN image_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(image_refs)='array' AND jsonb_array_length(image_refs)<=30),
 ADD COLUMN material_checks jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(material_checks)='object'), ADD COLUMN source_has_text boolean NOT NULL DEFAULT true, ADD COLUMN is_v2_submission boolean NOT NULL DEFAULT false;
ALTER TABLE public.property_processing_runs ADD CONSTRAINT web_v2_candidate_shape CHECK(NOT is_v2_submission OR
 (candidate IS NULL OR (jsonb_typeof(candidate->'listing_bundle') IS NOT DISTINCT FROM 'object' AND candidate->'listing_bundle'->>'schemaVersion' IS NOT DISTINCT FROM '2' AND jsonb_typeof(candidate->'sales_strategy') IS NOT DISTINCT FROM 'object')) AND
 (result IS NULL OR (jsonb_typeof(result->'listing_bundle') IS NOT DISTINCT FROM 'object' AND result->'listing_bundle'->>'schemaVersion' IS NOT DISTINCT FROM '2' AND jsonb_typeof(result->'sales_strategy') IS NOT DISTINCT FROM 'object')));

-- A worker without the v2 capability must never claim a v2 run. This remains
-- safe if an older worker is still running during a rolling deployment.
CREATE FUNCTION public.web_analysis_claim_capable(p_worker uuid,p_allow_v2 boolean,p_v2_only boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.property_analysis_jobs;run public.property_processing_runs;
BEGIN
 IF p_worker IS NULL OR p_allow_v2 IS NULL OR p_v2_only IS NULL OR p_v2_only AND NOT p_allow_v2 THEN RAISE EXCEPTION 'invalid_worker';END IF;
 FOR job IN SELECT j.* FROM public.property_analysis_jobs j JOIN public.property_processing_runs r ON r.id=j.run_id
  WHERE j.executor_kind='web_worker' AND j.state='running' AND j.lease_until<now() AND (p_allow_v2 OR NOT r.is_v2_submission) AND (NOT p_v2_only OR r.is_v2_submission)
  LIMIT 100 FOR UPDATE OF j SKIP LOCKED LOOP
  SELECT * INTO run FROM public.property_processing_runs WHERE id=job.run_id FOR UPDATE;
  IF FOUND AND run.state='running' AND run.candidate IS NULL AND (run.phase='generating' OR job.attempts>=5) THEN
   UPDATE public.property_processing_runs SET state='failed',phase='failed',last_error_code=CASE WHEN run.phase='generating' THEN 'outcome_unknown' ELSE 'lease_exhausted' END,updated_at=now() WHERE id=run.id RETURNING * INTO run;
   UPDATE public.property_analysis_jobs SET state='failed',last_error_code=run.last_error_code,claim_token=NULL,lease_until=NULL,updated_at=now() WHERE property_id=job.property_id;
  END IF;
 END LOOP;
 SELECT j.* INTO job FROM public.property_analysis_jobs j JOIN public.property_processing_runs r ON r.id=j.run_id
 WHERE j.executor_kind='web_worker' AND j.executor_epoch=r.executor_epoch AND r.state IN ('queued','running') AND j.next_attempt_at<=now()
 AND (p_allow_v2 OR NOT r.is_v2_submission) AND (NOT p_v2_only OR r.is_v2_submission) AND (j.attempts<5 OR r.candidate IS NOT NULL) AND (j.state='waiting' OR (j.state='running' AND j.lease_until<now()))
 ORDER BY r.created_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO run FROM public.property_processing_runs WHERE id=job.run_id FOR UPDATE;
 UPDATE public.property_analysis_jobs SET state='running',attempts=LEAST(attempts+1,5),claim_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',updated_at=now() WHERE property_id=job.property_id RETURNING * INTO job;
 UPDATE public.property_processing_runs SET state='running',phase=CASE WHEN candidate IS NOT NULL THEN 'saving' ELSE 'reading' END,attempts=job.attempts,worker_id=p_worker,started_at=COALESCE(started_at,now()),updated_at=now() WHERE id=run.id RETURNING * INTO run;
 RETURN jsonb_build_object('id',job.property_id,'run_id',run.id,'token',job.claim_token,'attempt',job.attempts,'raw_input',run.input_text,'documents',run.document_refs,'candidate',run.candidate,'executor_epoch',job.executor_epoch);
END $$;
CREATE OR REPLACE FUNCTION public.web_analysis_claim(p_worker uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT public.web_analysis_claim_capable(p_worker,false,false) $$;
CREATE FUNCTION public.web_analysis_claim_v2(p_worker uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT public.web_analysis_claim_capable(p_worker,true,false) $$;
CREATE FUNCTION public.web_analysis_claim_v2_only(p_worker uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT public.web_analysis_claim_capable(p_worker,true,true) $$;
REVOKE ALL ON FUNCTION public.web_analysis_claim_capable(uuid,boolean,boolean),public.web_analysis_claim_v2(uuid),public.web_analysis_claim_v2_only(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.web_analysis_claim_capable(uuid,boolean,boolean),public.web_analysis_claim_v2(uuid),public.web_analysis_claim_v2_only(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.web_worker_heartbeat(p_worker uuid,p_version text,p_environment text,p_capabilities text[],p_run uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_worker IS NULL OR p_version IS NULL OR p_version !~ '^[a-zA-Z0-9._-]{1,80}$' OR p_environment IS NULL OR p_environment NOT IN ('test','staging','production')
 OR p_capabilities IS NULL OR cardinality(p_capabilities) NOT BETWEEN 1 AND 5 OR NOT p_capabilities<@ARRAY['analysis','analysis_v2','plan','rewrite','image']::text[] THEN RAISE EXCEPTION 'invalid_worker';END IF;
 INSERT INTO public.web_worker_heartbeats(worker_id,version,environment,capabilities,current_run) VALUES(p_worker,p_version,p_environment,p_capabilities,p_run)
 ON CONFLICT(worker_id) DO UPDATE SET version=EXCLUDED.version,environment=EXCLUDED.environment,capabilities=EXCLUDED.capabilities,current_run=EXCLUDED.current_run,last_seen=now();
END $$;
-- Disabled until the matching API and worker contracts are deployed together.
-- Reserved property IDs are only storage prefixes; they do not create listings.
CREATE TABLE public.web_submission_sessions (
 request_id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 property_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), input_payload jsonb NOT NULL,
 draft_content jsonb NOT NULL, analysis_input text NOT NULL, fingerprint text NOT NULL,
 state text NOT NULL CHECK(state IN ('pending_upload','ready_to_commit','committed','expired')),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 committed_at timestamptz, active_run_id uuid REFERENCES public.property_processing_runs(id) ON DELETE RESTRICT, safe_initial_revision integer, prepared_run_id uuid REFERENCES public.property_processing_runs(id) ON DELETE RESTRICT, prepared_at timestamptz
);
CREATE TABLE public.web_submission_files (
 request_id uuid NOT NULL REFERENCES public.web_submission_sessions(request_id) ON DELETE RESTRICT,
 asset_id uuid NOT NULL, filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 255),
 mime text NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp','application/pdf')),
 kind text NOT NULL CHECK(kind IN ('photo','plan','document')),
 display_order integer NOT NULL CHECK(display_order BETWEEN 0 AND 29),
 byte_size bigint NOT NULL CHECK(byte_size BETWEEN 1 AND 8388608),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'), storage_path text NOT NULL UNIQUE,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','stored','removed','cleaning','cleaned')),
 upload_lease_until timestamptz, cleanup_token uuid, cleanup_lease_until timestamptz,
 PRIMARY KEY(request_id,asset_id), UNIQUE(request_id,sha256,byte_size),
 CHECK((mime='application/pdf' AND kind='document') OR (mime<>'application/pdf' AND kind IN ('photo','plan')))
);
CREATE TABLE public.property_editor_versions (
 property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
 revision integer NOT NULL CHECK(revision>0),content jsonb NOT NULL CHECK(jsonb_typeof(content)='object'),
 recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(property_id,revision)
);
ALTER TABLE public.web_submission_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_submission_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.web_submission_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_submission_files FORCE ROW LEVEL SECURITY;
ALTER TABLE public.property_editor_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_editor_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_submission_sessions,public.web_submission_files,public.property_editor_versions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.web_submission_sessions,public.web_submission_files TO service_role;
GRANT SELECT,INSERT ON public.property_editor_versions TO service_role;

CREATE FUNCTION public.web_submission_begin(p_request uuid,p_actor uuid,p_input jsonb,p_draft jsonb,p_analysis text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE session public.web_submission_sessions; item jsonb; file_id uuid; extension text; hash text; total_bytes bigint:=0; pdf_bytes bigint:=0; pdf_count integer:=0; position integer:=0;
BEGIN
 IF p_request IS NULL OR p_actor IS NULL OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR p_input->>'version' IS DISTINCT FROM '2'
 OR p_input->'rightsConfirmed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p_input->'providedText') IS DISTINCT FROM 'string' OR length(p_input->>'providedText')>16000
 OR jsonb_typeof(p_input->'title') IS DISTINCT FROM 'string' OR length(p_input->>'title')>200
 OR jsonb_typeof(p_input->'emphasis') IS DISTINCT FROM 'string' OR length(p_input->>'emphasis')>1000
 OR jsonb_typeof(p_input->'buyerIntent') IS DISTINCT FROM 'string' OR length(p_input->>'buyerIntent')>200
 OR jsonb_typeof(p_input->'attachments') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'attachments')>30
 OR (length(btrim(p_input->>'providedText'))=0 AND jsonb_array_length(p_input->'attachments')=0)
 OR jsonb_typeof(p_draft) IS DISTINCT FROM 'object' OR p_draft->>'schema_version' IS DISTINCT FROM '1.0'
 OR p_draft->'registration'->>'channel' IS DISTINCT FROM 'web' OR p_draft->'registration'->>'rightsApproved' IS DISTINCT FROM 'true'
 OR length(p_draft::text)>65000 OR p_analysis IS NULL OR length(p_analysis) NOT BETWEEN 1 AND 50000 THEN RAISE EXCEPTION 'invalid_submission'; END IF;
 hash:=md5(jsonb_build_array(p_actor,p_input,p_draft,p_analysis)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended('submission:'||p_request,0));
 SELECT * INTO session FROM public.web_submission_sessions WHERE request_id=p_request FOR UPDATE;
 IF FOUND THEN
  IF session.actor_id<>p_actor THEN RAISE EXCEPTION 'submission_not_found'; END IF;
  IF session.fingerprint<>hash THEN RAISE EXCEPTION 'submission_conflict'; END IF;
  RETURN jsonb_build_object('requestId',p_request,'state',session.state,'propertyId',CASE WHEN session.state='committed' THEN session.property_id ELSE NULL END,'replayed',true);
 END IF;
 INSERT INTO public.web_submission_sessions(request_id,actor_id,input_payload,draft_content,analysis_input,fingerprint,state)
 VALUES(p_request,p_actor,p_input,p_draft,p_analysis,hash,CASE WHEN jsonb_array_length(p_input->'attachments')=0 THEN 'ready_to_commit' ELSE 'pending_upload' END) RETURNING * INTO session;
 FOR item IN SELECT value FROM jsonb_array_elements(p_input->'attachments') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR jsonb_typeof(item->'bytes') IS DISTINCT FROM 'number' OR item->>'bytes' !~ '^[0-9]{1,8}$' OR (item->>'bytes')::bigint NOT BETWEEN 1 AND 8388608
  OR item->>'sha256' !~ '^[0-9a-f]{64}$' OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string' OR length(btrim(item->>'name')) NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'invalid_submission'; END IF;
  file_id:=(item->>'id')::uuid;
  extension:=CASE item->>'mime' WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' WHEN 'application/pdf' THEN 'pdf' ELSE NULL END;
  IF extension IS NULL OR item->>'kind' NOT IN ('photo','plan','document') OR (extension='pdf') IS DISTINCT FROM (item->>'kind'='document') THEN RAISE EXCEPTION 'invalid_submission'; END IF;
  total_bytes:=total_bytes+(item->>'bytes')::bigint;
  IF extension='pdf' THEN pdf_count:=pdf_count+1;pdf_bytes:=pdf_bytes+(item->>'bytes')::bigint;END IF;
  INSERT INTO public.web_submission_files(request_id,asset_id,filename,mime,kind,display_order,byte_size,sha256,storage_path)
  VALUES(p_request,file_id,item->>'name',item->>'mime',item->>'kind',position,(item->>'bytes')::bigint,item->>'sha256',session.property_id||'/'||file_id||'.'||extension);
  position:=position+1;
 END LOOP;
 IF total_bytes>104857600 OR pdf_count>12 OR pdf_bytes>25165824 THEN RAISE EXCEPTION 'invalid_submission'; END IF;
 RETURN jsonb_build_object('requestId',p_request,'state',session.state,'propertyId',NULL,'replayed',false);
END $$;

CREATE FUNCTION public.web_submission_status(p_request uuid,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.web_submission_sessions;
BEGIN
 SELECT * INTO s FROM public.web_submission_sessions WHERE request_id=p_request AND actor_id=p_actor;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('requestId',s.request_id,'state',CASE WHEN s.state<>'committed' AND s.expires_at<=now() THEN 'expired' ELSE s.state END,
  'propertyId',CASE WHEN s.state='committed' THEN s.property_id ELSE NULL END,'input',s.input_payload,
  'files',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.asset_id,'state',f.state) ORDER BY f.asset_id) FROM public.web_submission_files f WHERE f.request_id=s.request_id),'[]'::jsonb));
END $$;

CREATE FUNCTION public.web_submission_file(p_request uuid,p_actor uuid,p_asset uuid,p_confirm boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.web_submission_sessions; f public.web_submission_files;
BEGIN
 SELECT * INTO s FROM public.web_submission_sessions WHERE request_id=p_request AND actor_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'submission_not_found'; END IF;
 IF s.state IN ('committed','expired') OR s.expires_at<=now() THEN RAISE EXCEPTION 'submission_closed'; END IF;
 SELECT * INTO f FROM public.web_submission_files WHERE request_id=p_request AND asset_id=p_asset FOR UPDATE;
 IF NOT FOUND OR f.state IN ('removed','cleaning','cleaned') THEN RAISE EXCEPTION 'submission_file_missing'; END IF;
 -- Only the service-side API may confirm after checking bytes, MIME and digest.
 IF p_confirm THEN
  UPDATE public.web_submission_files SET state='stored' WHERE request_id=p_request AND asset_id=p_asset;
  IF NOT EXISTS(SELECT 1 FROM public.web_submission_files WHERE request_id=p_request AND state='pending') THEN UPDATE public.web_submission_sessions SET state='ready_to_commit' WHERE request_id=p_request;END IF;
  f.state:='stored';
 ELSIF f.state='pending' THEN
  -- Retain a grace period even after confirmation: another matching retry may
  -- still have an in-flight Storage request when a user removes this file.
  UPDATE public.web_submission_files SET upload_lease_until=now()+interval '5 minutes' WHERE request_id=p_request AND asset_id=p_asset;
 END IF;
 RETURN jsonb_build_object('id',f.asset_id,'state',f.state,'path',f.storage_path,'mime',f.mime,'bytes',f.byte_size,'sha256',f.sha256);
END $$;

CREATE FUNCTION public.web_submission_remove_file(p_request uuid,p_actor uuid,p_asset uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.web_submission_sessions; f public.web_submission_files; remaining jsonb;
BEGIN
 SELECT * INTO s FROM public.web_submission_sessions WHERE request_id=p_request AND actor_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'submission_not_found'; END IF;
 IF s.state IN ('committed','expired') OR s.expires_at<=now() THEN RAISE EXCEPTION 'submission_closed'; END IF;
 SELECT * INTO f FROM public.web_submission_files WHERE request_id=p_request AND asset_id=p_asset FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'submission_file_missing'; END IF;
 IF f.state IN ('removed','cleaning','cleaned') THEN RETURN jsonb_build_object('removed',true,'replayed',true);END IF;
 SELECT COALESCE(jsonb_agg(value ORDER BY ord),'[]'::jsonb) INTO remaining FROM jsonb_array_elements(s.input_payload->'attachments') WITH ORDINALITY AS a(value,ord) WHERE (value->>'id')::uuid<>p_asset;
 IF jsonb_array_length(remaining)=0 AND length(btrim(s.input_payload->>'providedText'))=0 THEN RAISE EXCEPTION 'submission_requires_source';END IF;
 UPDATE public.web_submission_files SET state='removed' WHERE request_id=p_request AND asset_id=p_asset;
 UPDATE public.web_submission_sessions SET input_payload=jsonb_set(input_payload,'{attachments}',remaining),state=CASE WHEN EXISTS(SELECT 1 FROM public.web_submission_files WHERE request_id=p_request AND state='pending') THEN 'pending_upload' ELSE 'ready_to_commit' END WHERE request_id=p_request;
 RETURN jsonb_build_object('removed',true,'replayed',false);
END $$;

CREATE FUNCTION public.web_submission_cleanup_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.web_submission_sessions; f public.web_submission_files; token uuid;
BEGIN
 -- Lock the session before its files, matching upload, remove and commit.
 SELECT ss.* INTO s FROM public.web_submission_sessions ss WHERE
  (ss.state='committed' AND EXISTS(SELECT 1 FROM public.web_submission_files ff WHERE ff.request_id=ss.request_id AND (ff.state='removed' OR ff.state='cleaning' AND ff.cleanup_lease_until<now()) AND COALESCE(ff.upload_lease_until,'-infinity')<now()))
  OR (ss.state<>'committed' AND ss.expires_at<=now() AND EXISTS(SELECT 1 FROM public.web_submission_files ff WHERE ff.request_id=ss.request_id AND ff.state<>'cleaned' AND (ff.state<>'cleaning' OR ff.cleanup_lease_until<now()) AND COALESCE(ff.upload_lease_until,'-infinity')<now()))
 ORDER BY ss.created_at LIMIT 1 FOR UPDATE OF ss SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF s.state<>'committed' THEN UPDATE public.web_submission_sessions SET state='expired',input_payload='{}'::jsonb,draft_content='{}'::jsonb,analysis_input='',fingerprint='expired' WHERE request_id=s.request_id;END IF;
 SELECT ff.* INTO f FROM public.web_submission_files ff WHERE ff.request_id=s.request_id
 AND (s.state<>'committed' OR ff.state IN ('removed','cleaning')) AND ff.state<>'cleaned'
 AND (ff.state<>'cleaning' OR ff.cleanup_lease_until<now()) AND COALESCE(ff.upload_lease_until,'-infinity')<now()
 AND NOT EXISTS(SELECT 1 FROM public.property_assets a WHERE a.bucket_id='showroom-private-media' AND a.storage_path=ff.storage_path)
 ORDER BY ff.asset_id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL;END IF;
 token:=gen_random_uuid();UPDATE public.web_submission_files SET state='cleaning',cleanup_token=token,cleanup_lease_until=now()+interval '5 minutes' WHERE request_id=f.request_id AND asset_id=f.asset_id;
 RETURN jsonb_build_object('requestId',f.request_id,'assetId',f.asset_id,'path',f.storage_path,'token',token);
END $$;

CREATE FUNCTION public.web_submission_expire_sessions() RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE expired_count integer;
BEGIN
 WITH chosen AS (SELECT request_id FROM public.web_submission_sessions WHERE state NOT IN ('committed','expired') AND expires_at<=now() ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED),
 changed AS (UPDATE public.web_submission_sessions s SET state='expired',input_payload='{}'::jsonb,draft_content='{}'::jsonb,analysis_input='',fingerprint='expired' FROM chosen c WHERE s.request_id=c.request_id RETURNING 1)
 SELECT count(*) INTO expired_count FROM changed;
 RETURN expired_count;
END $$;

CREATE FUNCTION public.web_analysis_material(p_property uuid,p_token uuid,p_asset uuid,p_result jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.property_analysis_jobs; run public.property_processing_runs; previous jsonb;
BEGIN
 SELECT * INTO job FROM public.property_analysis_jobs WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND OR job.executor_kind<>'web_worker' OR job.state<>'running' OR job.claim_token IS DISTINCT FROM p_token OR job.lease_until<now() THEN RETURN false;END IF;
 SELECT * INTO run FROM public.property_processing_runs WHERE id=job.run_id FOR UPDATE;
 IF NOT FOUND OR run.state<>'running' OR run.executor_epoch<>job.executor_epoch OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(run.image_refs||run.document_refs) x WHERE x->>'assetId'=p_asset::text)
 OR jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR length(p_result::text)>10000 OR COALESCE(p_result->>'state','') NOT IN ('read','partial','unreadable') THEN RAISE EXCEPTION 'invalid_material_result';END IF;
 previous:=run.material_checks->p_asset::text;
 IF previous IS NOT NULL AND previous IS DISTINCT FROM p_result THEN RAISE EXCEPTION 'material_result_conflict';END IF;
 -- A successful material response is durable. Returning to reading lets a
 -- reclaimed worker skip this file; a lost call before this write stays in
 -- generating and is treated as an uncertain provider outcome.
 UPDATE public.property_processing_runs SET material_checks=jsonb_set(material_checks,ARRAY[p_asset::text],p_result,true),phase='reading',updated_at=now() WHERE id=run.id;
 RETURN true;
END $$;

CREATE FUNCTION public.web_submission_cleanup_finish(p_request uuid,p_asset uuid,p_token uuid,p_deleted boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.web_submission_sessions; f public.web_submission_files;
BEGIN
 SELECT * INTO s FROM public.web_submission_sessions WHERE request_id=p_request FOR UPDATE;IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO f FROM public.web_submission_files WHERE request_id=p_request AND asset_id=p_asset FOR UPDATE;
 IF NOT FOUND OR f.state<>'cleaning' OR f.cleanup_token IS DISTINCT FROM p_token OR f.cleanup_lease_until<now() OR p_deleted IS DISTINCT FROM true
 OR EXISTS(SELECT 1 FROM public.property_assets a WHERE a.bucket_id='showroom-private-media' AND a.storage_path=f.storage_path) THEN RETURN false;END IF;
 UPDATE public.web_submission_files SET state='cleaned',cleanup_token=NULL,cleanup_lease_until=NULL WHERE request_id=p_request AND asset_id=p_asset;
 RETURN true;
END $$;

CREATE FUNCTION public.web_submission_commit(p_request uuid,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.web_submission_sessions; f public.web_submission_files; source jsonb; refs jsonb; doc_ids jsonb; raw text; created timestamptz;
BEGIN
 SELECT * INTO s FROM public.web_submission_sessions WHERE request_id=p_request AND actor_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'submission_not_found';END IF;
 IF s.state='committed' THEN RETURN jsonb_build_object('propertyId',s.property_id,'requestId',p_request,'replayed',true);END IF;
 IF s.state<>'ready_to_commit' OR s.expires_at<=now() OR EXISTS(SELECT 1 FROM public.web_submission_files WHERE request_id=p_request AND state='pending') THEN RAISE EXCEPTION 'submission_not_ready';END IF;
 source:=jsonb_build_object('version',1,'mode','materials','providedText',s.input_payload->>'providedText');
 INSERT INTO public.properties(id,address,raw_input,status) VALUES(s.property_id,NULL,'웹 등록 비공개 입력','pending');
 INSERT INTO public.property_analysis_jobs(property_id,next_attempt_at) VALUES(s.property_id,'infinity'::timestamptz);
 INSERT INTO public.property_showrooms(property_id,slug,showroom_status,draft_content) VALUES(s.property_id,'property-'||s.property_id,'draft',jsonb_set(jsonb_set(s.draft_content,'{id}',to_jsonb(s.property_id::text)),'{title}',to_jsonb(CASE WHEN btrim(s.input_payload->>'title')='' THEN '새 매물 · '||to_char(s.created_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD HH24:MI') ELSE s.input_payload->>'title' END)));
 INSERT INTO public.property_web_intakes(property_id,request_id,created_by,payload_hash,input_payload,source_revision,source_updated_at,creation_input_hash,form_closed)
 VALUES(s.property_id,p_request,p_actor,md5(s.draft_content::text),source,1,now(),s.fingerprint,true);
 INSERT INTO public.property_web_input_versions(property_id,source_revision,input_payload,updated_by) VALUES(s.property_id,1,source,p_actor);
 FOR f IN SELECT * FROM public.web_submission_files WHERE request_id=p_request AND state='stored' ORDER BY display_order LOOP
  INSERT INTO public.property_assets(id,property_id,kind,source_type,caption,bucket_id,storage_path,is_approved,display_order,sha256,byte_size)
  VALUES(f.asset_id,s.property_id,CASE WHEN f.kind='plan' THEN 'provided_plan' ELSE f.kind END,'owner_provided',f.filename,'showroom-private-media',f.storage_path,false,f.display_order,f.sha256,f.byte_size);
 END LOOP;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('assetId',a.id,'createdAt',a.created_at,'sha256',a.sha256,'bytes',a.byte_size) ORDER BY a.created_at,a.id),'[]'::jsonb),
        COALESCE(jsonb_agg(to_jsonb(a.id) ORDER BY a.created_at,a.id),'[]'::jsonb)
 INTO refs,doc_ids FROM public.property_assets a JOIN public.web_submission_files sf ON sf.asset_id=a.id AND sf.request_id=p_request WHERE a.property_id=s.property_id AND sf.kind='document';
 raw:=s.analysis_input||COALESCE((SELECT string_agg(E'\n[DOCUMENT_ID:'||(value->>'assetId')||']','') FROM jsonb_array_elements(refs)),'');
 PERFORM public.web_queue_processing(s.property_id,p_actor,p_request,1,1,jsonb_build_object('draftRevision',1,'sourceRevision',1,'documentIds',doc_ids),raw,refs);
 UPDATE public.property_processing_runs SET is_v2_submission=true,source_has_text=length(btrim(s.input_payload->>'providedText'))>0,image_refs=COALESCE((SELECT jsonb_agg(jsonb_build_object('assetId',a.id,'createdAt',a.created_at,'sha256',a.sha256,'bytes',a.byte_size,'kind',sf.kind,'mime',sf.mime) ORDER BY a.created_at,a.id) FROM public.property_assets a JOIN public.web_submission_files sf ON sf.asset_id=a.id AND sf.request_id=p_request WHERE a.property_id=s.property_id AND sf.kind IN ('photo','plan')),'[]'::jsonb) WHERE id=p_request;
 UPDATE public.web_submission_sessions SET state='committed',committed_at=now(),active_run_id=p_request,safe_initial_revision=1 WHERE request_id=p_request;
 RETURN jsonb_build_object('propertyId',s.property_id,'requestId',p_request,'replayed',false);
END $$;

CREATE FUNCTION public.web_update_v2_source(p_property uuid,p_actor uuid,p_revision integer,p_source_revision integer,p_request uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.web_submission_sessions;i public.property_web_intakes;room public.property_showrooms;saved jsonb;
BEGIN
 SELECT * INTO s FROM public.web_submission_sessions WHERE property_id=p_property AND actor_id=p_actor AND state='committed' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'submission_not_found';END IF;
 IF s.prepared_run_id IS NOT NULL THEN RAISE EXCEPTION 'submission_closed';END IF;
 SELECT * INTO i FROM public.property_web_intakes WHERE property_id=p_property AND created_by=p_actor FOR UPDATE;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND OR room.revision IS DISTINCT FROM s.safe_initial_revision THEN RAISE EXCEPTION 'processing_stale';END IF;
 saved:=public.web_save_source(p_property,p_actor,p_revision,p_source_revision,p_request,p_input);
 IF (saved->>'appliedRevision')::integer IS DISTINCT FROM (saved->'showroom'->>'revision')::integer THEN RAISE EXCEPTION 'revision_conflict';END IF;
 UPDATE public.web_submission_sessions SET safe_initial_revision=(saved->>'appliedRevision')::integer WHERE request_id=s.request_id;
 RETURN saved;
END $$;

CREATE FUNCTION public.web_exclude_v2_source(p_property uuid,p_actor uuid,p_asset uuid,p_revision integer,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.web_submission_sessions;i public.property_web_intakes;room public.property_showrooms;previous public.property_web_intake_writes;fingerprint text;asset public.property_assets;
BEGIN
 IF p_request IS NULL OR p_asset IS NULL OR p_revision IS NULL OR p_revision<1 THEN RAISE EXCEPTION 'invalid_processing_request';END IF;
 SELECT * INTO s FROM public.web_submission_sessions WHERE property_id=p_property AND actor_id=p_actor AND state='committed' FOR UPDATE;
 IF NOT FOUND OR s.prepared_run_id IS NOT NULL THEN RAISE EXCEPTION 'submission_not_found';END IF;
 SELECT * INTO i FROM public.property_web_intakes WHERE property_id=p_property AND created_by=p_actor FOR UPDATE;
 fingerprint:=md5(jsonb_build_array('exclude',p_actor,p_asset,p_revision)::text);
 SELECT * INTO previous FROM public.property_web_intake_writes WHERE property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF previous.fingerprint<>fingerprint THEN RAISE EXCEPTION 'web_write_conflict';END IF;
  RETURN public.web_intake_receipt(p_actor,NULL,p_property)||jsonb_build_object('replayed',true,'appliedRevision',previous.applied_revision);
 END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND OR room.revision<>p_revision OR room.revision IS DISTINCT FROM s.safe_initial_revision THEN RAISE EXCEPTION 'processing_stale';END IF;
 SELECT * INTO asset FROM public.property_assets WHERE id=p_asset AND property_id=p_property AND bucket_id='showroom-private-media' AND kind IN ('photo','provided_plan','document') AND source_type IN ('owner_provided','photographed') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'profile_source_missing';END IF;
 UPDATE public.property_assets SET excluded_from_analysis=true WHERE id=p_asset;
 UPDATE public.property_showrooms SET revision=revision+1 WHERE property_id=p_property;
 UPDATE public.web_submission_sessions SET safe_initial_revision=p_revision+1 WHERE request_id=s.request_id;
 INSERT INTO public.property_web_intake_writes(property_id,request_id,fingerprint,applied_revision,source_revision) VALUES(p_property,p_request,fingerprint,p_revision+1,i.source_revision);
 RETURN public.web_intake_receipt(p_actor,NULL,p_property)||jsonb_build_object('replayed',false,'appliedRevision',p_revision+1);
END $$;

CREATE FUNCTION public.web_queue_v2_run(p_property uuid,p_actor uuid,p_request uuid,p_revision integer,p_source_revision integer,p_spec jsonb,p_raw text,p_documents jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.web_submission_sessions;i public.property_web_intakes;room public.property_showrooms;previous jsonb;queued jsonb;images jsonb;image_count integer;image_bytes bigint;doc_bytes bigint;analysis_raw text;
BEGIN
 SELECT * INTO s FROM public.web_submission_sessions WHERE property_id=p_property AND actor_id=p_actor AND state='committed' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'submission_not_found';END IF;
 previous:=public.web_processing_receipt(p_property,p_actor,p_request,p_spec);
 IF previous IS NOT NULL THEN
  IF s.prepared_run_id IS NULL AND s.active_run_id IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'processing_request_conflict';END IF;
  RETURN previous;
 END IF;
 IF EXISTS(SELECT 1 FROM public.property_processing_runs WHERE property_id=p_property AND last_error_code='outcome_unknown') THEN RAISE EXCEPTION 'processing_outcome_unknown';END IF;
 SELECT * INTO i FROM public.property_web_intakes WHERE property_id=p_property AND created_by=p_actor;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property;
 IF s.prepared_run_id IS NULL AND room.revision IS DISTINCT FROM s.safe_initial_revision THEN RAISE EXCEPTION 'processing_stale';END IF;
 IF jsonb_typeof(p_documents) IS DISTINCT FROM 'array' OR jsonb_array_length(p_documents)>12 THEN RAISE EXCEPTION 'invalid_processing_request';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_documents) d LEFT JOIN public.property_assets a ON a.id::text=d->>'assetId' AND a.property_id=p_property AND a.kind='document' AND a.source_type<>'ai_generated' AND a.bucket_id='showroom-private-media' AND NOT a.excluded_from_analysis WHERE a.id IS NULL OR a.sha256 IS NULL OR a.sha256 IS DISTINCT FROM d->>'sha256' OR a.byte_size IS DISTINCT FROM (d->>'bytes')::bigint OR a.created_at IS DISTINCT FROM (d->>'createdAt')::timestamptz) THEN RAISE EXCEPTION 'invalid_material_snapshot';END IF;
 IF EXISTS(SELECT 1 FROM public.property_assets a WHERE a.property_id=p_property AND a.bucket_id='showroom-private-media' AND a.kind IN ('photo','provided_plan') AND a.source_type IN ('owner_provided','photographed') AND NOT a.excluded_from_analysis AND (a.sha256 IS NULL OR a.byte_size IS NULL OR a.storage_path !~* '\.(jpg|png|webp)$')) THEN RAISE EXCEPTION 'invalid_material_snapshot';END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('assetId',a.id,'createdAt',a.created_at,'sha256',a.sha256,'bytes',a.byte_size,'kind',CASE WHEN a.kind='provided_plan' THEN 'plan' ELSE 'photo' END,'mime',CASE WHEN a.storage_path ILIKE '%.jpg' THEN 'image/jpeg' WHEN a.storage_path ILIKE '%.png' THEN 'image/png' ELSE 'image/webp' END) ORDER BY a.display_order,a.created_at,a.id),'[]'::jsonb),count(*)::integer,COALESCE(sum(a.byte_size),0)
 INTO images,image_count,image_bytes FROM public.property_assets a WHERE a.property_id=p_property AND a.bucket_id='showroom-private-media' AND a.kind IN ('photo','provided_plan') AND a.source_type IN ('owner_provided','photographed') AND NOT a.excluded_from_analysis;
 SELECT COALESCE(sum((d->>'bytes')::bigint),0) INTO doc_bytes FROM jsonb_array_elements(p_documents) d;
 IF image_count+jsonb_array_length(p_documents)>30 OR image_bytes+doc_bytes>104857600 OR (length(btrim(i.input_payload->>'providedText'))=0 AND image_count=0 AND jsonb_array_length(p_documents)=0) THEN RAISE EXCEPTION 'invalid_material_snapshot';END IF;
 analysis_raw:=p_raw||E'\n등록자의 판매 의견(검증된 사실이 아님): '||regexp_replace(jsonb_build_object('emphasis',s.input_payload->>'emphasis','buyerIntent',s.input_payload->>'buyerIntent')::text,'\[(FILE|DOCUMENT)_ID:[^]]*\]','','g');
 queued:=public.web_queue_processing(p_property,p_actor,p_request,p_revision,p_source_revision,p_spec,analysis_raw,p_documents);
 UPDATE public.property_processing_runs SET is_v2_submission=true,source_has_text=length(btrim(i.input_payload->>'providedText'))>0,image_refs=images WHERE id=p_request;
 IF s.prepared_run_id IS NULL THEN UPDATE public.web_submission_sessions SET active_run_id=p_request WHERE request_id=s.request_id;END IF;
 RETURN queued;
END $$;

CREATE FUNCTION public.web_cancel_v2_run(p_property uuid,p_actor uuid,p_run uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.web_submission_sessions;j public.property_analysis_jobs;r public.property_processing_runs;
BEGIN
 SELECT * INTO s FROM public.web_submission_sessions WHERE property_id=p_property AND actor_id=p_actor AND state='committed' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'submission_not_found';END IF;
 SELECT * INTO j FROM public.property_analysis_jobs WHERE property_id=p_property FOR UPDATE;
 SELECT * INTO r FROM public.property_processing_runs WHERE property_id=p_property AND id=p_run AND requested_by=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'processing_missing';END IF;
 IF r.last_error_code='outcome_unknown' OR r.state='running' AND r.phase='generating' THEN RAISE EXCEPTION 'processing_outcome_unknown';END IF;
 RETURN public.web_cancel_processing(p_property,p_actor,p_run);
END $$;

CREATE FUNCTION public.web_initial_next() RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('propertyId',s.property_id,'runId',r.id,'revision',room.revision,'result',r.result)
 FROM public.web_submission_sessions s JOIN public.property_processing_runs r ON r.id=s.active_run_id AND r.property_id=s.property_id
 JOIN public.property_showrooms room ON room.property_id=s.property_id JOIN public.property_web_intakes i ON i.property_id=s.property_id
 WHERE s.state='committed' AND s.prepared_run_id IS NULL AND r.is_v2_submission AND r.state='done' AND r.input_revision=room.revision AND r.source_revision=i.source_revision
 AND room.revision=s.safe_initial_revision AND jsonb_typeof(r.result->'showroom_concepts')='array' AND jsonb_typeof(r.result->'usp_summary')='string' AND length(btrim(r.result->>'usp_summary'))>0
 AND jsonb_typeof(r.result->'landing_copy')='string' AND length(btrim(r.result->>'landing_copy'))>0 AND jsonb_typeof(r.result->'listing_bundle')='object' AND jsonb_typeof(r.result->'sales_strategy')='object'
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.image_refs||r.document_refs) x WHERE NOT r.material_checks ? (x->>'assetId'))
 ORDER BY r.created_at LIMIT 1
$$;

CREATE FUNCTION public.web_initial_prepare(p_property uuid,p_run uuid,p_revision integer,p_generated jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.web_submission_sessions;r public.property_processing_runs;room public.property_showrooms;i public.property_web_intakes;content jsonb;saved jsonb;
BEGIN
 SELECT * INTO s FROM public.web_submission_sessions WHERE property_id=p_property AND state='committed' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'submission_not_found';END IF;
 IF s.prepared_run_id IS NOT NULL THEN RETURN jsonb_build_object('prepared',false,'replayed',true);END IF;
 SELECT * INTO i FROM public.property_web_intakes WHERE property_id=p_property AND created_by=s.actor_id FOR UPDATE;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 SELECT * INTO r FROM public.property_processing_runs WHERE id=p_run AND property_id=p_property AND requested_by=s.actor_id FOR UPDATE;
 IF NOT FOUND OR r.id IS DISTINCT FROM s.active_run_id OR NOT r.is_v2_submission OR r.state<>'done' OR room.revision IS DISTINCT FROM s.safe_initial_revision OR p_revision<>room.revision OR r.input_revision<>room.revision OR r.source_revision<>i.source_revision THEN RAISE EXCEPTION 'processing_stale';END IF;
 IF jsonb_typeof(p_generated) IS DISTINCT FROM 'object' OR length(p_generated::text)>100000 OR jsonb_typeof(p_generated->'subtitle') IS DISTINCT FROM 'string'
 OR length(btrim(p_generated->>'subtitle')) NOT BETWEEN 1 AND 100 OR jsonb_typeof(p_generated->'summary') IS DISTINCT FROM 'string' OR length(btrim(p_generated->>'summary')) NOT BETWEEN 1 AND 4000
 OR jsonb_typeof(p_generated->'concepts') IS DISTINCT FROM 'array' OR jsonb_array_length(p_generated->'concepts')>3 OR jsonb_typeof(p_generated->'unknowns') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_generated->'marketing') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_generated))<>7 OR jsonb_typeof(r.result->'listing_bundle') IS DISTINCT FROM 'object' OR jsonb_typeof(r.result->'sales_strategy') IS DISTINCT FROM 'object'
 OR p_generated->'listingBundle' IS DISTINCT FROM r.result->'listing_bundle' OR p_generated->'salesStrategy' IS DISTINCT FROM r.result->'sales_strategy'
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.image_refs||r.document_refs) x WHERE NOT r.material_checks ? (x->>'assetId')) THEN RAISE EXCEPTION 'invalid_processing_result';END IF;
 content:=room.draft_content||p_generated;
 saved:=public.web_apply_processing(p_property,s.actor_id,p_run,p_revision,content,ARRAY[]::text[],true);
 UPDATE public.web_submission_sessions SET prepared_run_id=p_run,prepared_at=now() WHERE request_id=s.request_id;
 RETURN jsonb_build_object('prepared',true,'replayed',false,'revision',(saved->>'revision')::integer);
END $$;

CREATE FUNCTION public.web_submission_access(p_property uuid,p_actor uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('owned',actor_id=p_actor,'editorReady',actor_id=p_actor AND prepared_run_id IS NOT NULL)
 FROM public.web_submission_sessions WHERE property_id=p_property AND state='committed'
$$;

CREATE FUNCTION public.web_apply_v2_reanalysis(p_property uuid,p_actor uuid,p_run uuid,p_revision integer,p_content jsonb,p_slots text[],p_evidence boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE session public.web_submission_sessions;room public.property_showrooms;run public.property_processing_runs;saved jsonb;
BEGIN
 SELECT * INTO session FROM public.web_submission_sessions WHERE property_id=p_property AND actor_id=p_actor AND state='committed' FOR UPDATE;
 IF NOT FOUND OR session.prepared_run_id IS NULL THEN RAISE EXCEPTION 'draft_not_ready';END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property;
 SELECT * INTO run FROM public.property_processing_runs WHERE id=p_run AND property_id=p_property AND requested_by=p_actor;
 IF NOT FOUND OR NOT run.is_v2_submission OR run.id=session.prepared_run_id THEN RAISE EXCEPTION 'processing_missing';END IF;
 saved:=public.web_apply_processing(p_property,p_actor,p_run,p_revision,p_content,p_slots,p_evidence);
 IF run.state='applied' THEN RETURN saved;END IF;
 INSERT INTO public.property_editor_versions(property_id,revision,content,recorded_by) VALUES(p_property,room.revision,room.draft_content,p_actor) ON CONFLICT DO NOTHING;
 IF EXISTS(SELECT 1 FROM public.property_editor_versions WHERE property_id=p_property AND revision=room.revision AND content IS DISTINCT FROM room.draft_content) THEN RAISE EXCEPTION 'editor_history_conflict';END IF;
 INSERT INTO public.property_editor_versions(property_id,revision,content,recorded_by) VALUES(p_property,(saved->>'revision')::integer,saved->'draft_content',p_actor);
 RETURN saved;
END $$;

CREATE FUNCTION public.web_save_editor_v2(p_property uuid,p_actor uuid,p_revision integer,p_content jsonb,p_slots text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
END $$;

CREATE FUNCTION public.web_property_overview(p_actor uuid,p_search text,p_status text,p_limit integer,p_offset integer,p_environment text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE output jsonb;
BEGIN
 IF p_actor IS NULL OR p_search IS NULL OR length(p_search)>200 OR p_status IS NULL OR p_status NOT IN ('','queued','reading','generating','assembling','ready','needs_input','failed','published')
 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000 OR p_environment IS NULL OR p_environment NOT IN ('production','staging','test') THEN RAISE EXCEPTION 'invalid_listing_query';END IF;
 WITH base AS MATERIALIZED (
  SELECT p.id,COALESCE(NULLIF(room.draft_content->>'title',''),NULLIF(p.address,''),'새 매물') AS title,
   COALESCE(NULLIF(room.draft_content->>'address',''),p.address,'') AS address,
   COALESCE(room.draft_content->'propertyProfile'->>'kind',room.draft_content->>'category','unknown') AS kind,
   COALESCE(room.updated_at,p.created_at) AS saved_at,
   CASE WHEN s.request_id IS NOT NULL THEN s.prepared_run_id IS NOT NULL ELSE p.status='analyzed' AND room.property_id IS NOT NULL END AS editor_ready,
   room.showroom_status='published' AND room.published_content IS NOT NULL AS live_release,
   room.published_revision IS NOT NULL AND room.revision>room.published_revision AS unpublished_changes,
   CASE WHEN r.last_error_code='source_unreadable' THEN 'needs_input' WHEN r.state IN ('failed','cancelled') THEN 'failed'
        WHEN r.state='queued' THEN 'queued' WHEN r.state='running' AND r.phase='generating' THEN 'generating'
        WHEN r.state='running' AND r.phase='saving' OR r.state='done' THEN 'assembling'
        WHEN r.state='running' THEN 'reading' WHEN s.prepared_run_id IS NOT NULL OR (s.request_id IS NULL AND p.status='analyzed' AND room.property_id IS NOT NULL) THEN 'ready'
        ELSE 'queued' END AS preparation_state
  FROM public.properties p LEFT JOIN public.property_showrooms room ON room.property_id=p.id
  LEFT JOIN public.property_web_intakes intake ON intake.property_id=p.id
  LEFT JOIN public.web_submission_sessions s ON s.property_id=p.id AND s.state='committed'
  LEFT JOIN LATERAL (SELECT state,phase,last_error_code FROM public.property_processing_runs WHERE property_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1) r ON true
  WHERE p.status IS DISTINCT FROM 'merged' AND (intake.property_id IS NULL OR intake.created_by=p_actor) AND (s.request_id IS NULL OR s.actor_id=p_actor)
 ), filtered AS MATERIALIZED (
  SELECT * FROM base WHERE (p_search='' OR strpos(lower(title),lower(p_search))>0 OR strpos(lower(address),lower(p_search))>0)
   AND (p_status='' OR p_status='published' AND live_release OR p_status<>'published' AND preparation_state=p_status)
 ), page AS (SELECT * FROM filtered ORDER BY saved_at DESC,id DESC LIMIT p_limit OFFSET p_offset)
 SELECT jsonb_build_object(
  'properties',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'title',title,'address',address,'kind',kind,'savedAt',saved_at,'preparationState',preparation_state,'editorReady',COALESCE(editor_ready,false),'availableAction',CASE WHEN live_release AND NOT COALESCE(unpublished_changes,false) THEN 'view_completed' WHEN editor_ready THEN 'edit' WHEN preparation_state='needs_input' THEN 'supplement' WHEN preparation_state='failed' THEN 'retry' ELSE 'view_status' END,'liveRelease',COALESCE(live_release,false),'hasUnpublishedChanges',COALESCE(unpublished_changes,false)) ORDER BY saved_at DESC,id DESC) FROM page),'[]'::jsonb),
  'total',(SELECT count(*) FROM filtered),'offset',p_offset,'limit',p_limit,
  'summary',jsonb_build_object('processing',(SELECT count(*) FROM base WHERE preparation_state IN ('queued','reading','generating','assembling')),'editable',(SELECT count(*) FROM base WHERE editor_ready),'attention',(SELECT count(*) FROM base WHERE preparation_state IN ('needs_input','failed')),'published',(SELECT count(*) FROM base WHERE live_release)),
  'pendingSubmissions',COALESCE((SELECT jsonb_agg(jsonb_build_object('requestId',pending.request_id,'createdAt',pending.created_at) ORDER BY pending.created_at DESC) FROM (SELECT request_id,created_at FROM public.web_submission_sessions WHERE actor_id=p_actor AND state IN ('pending_upload','ready_to_commit') AND expires_at>now() ORDER BY created_at DESC LIMIT 5) pending),'[]'::jsonb),
  'workerAvailable',EXISTS(SELECT 1 FROM public.web_worker_heartbeats WHERE environment=p_environment AND 'analysis_v2'=ANY(capabilities) AND last_seen>now()-interval '60 seconds')
 ) INTO output;
 RETURN output;
END $$;
REVOKE ALL ON FUNCTION public.web_submission_begin(uuid,uuid,jsonb,jsonb,text),public.web_submission_status(uuid,uuid),public.web_submission_file(uuid,uuid,uuid,boolean),public.web_submission_remove_file(uuid,uuid,uuid),public.web_submission_cleanup_claim(),public.web_submission_expire_sessions(),public.web_analysis_material(uuid,uuid,uuid,jsonb),public.web_submission_cleanup_finish(uuid,uuid,uuid,boolean),public.web_submission_commit(uuid,uuid),public.web_update_v2_source(uuid,uuid,integer,integer,uuid,jsonb),public.web_exclude_v2_source(uuid,uuid,uuid,integer,uuid),public.web_queue_v2_run(uuid,uuid,uuid,integer,integer,jsonb,text,jsonb),public.web_cancel_v2_run(uuid,uuid,uuid),public.web_initial_next(),public.web_initial_prepare(uuid,uuid,integer,jsonb),public.web_submission_access(uuid,uuid),public.web_apply_v2_reanalysis(uuid,uuid,uuid,integer,jsonb,text[],boolean),public.web_save_editor_v2(uuid,uuid,integer,jsonb,text[]),public.web_property_overview(uuid,text,text,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.web_submission_begin(uuid,uuid,jsonb,jsonb,text),public.web_submission_status(uuid,uuid),public.web_submission_file(uuid,uuid,uuid,boolean),public.web_submission_remove_file(uuid,uuid,uuid),public.web_submission_cleanup_claim(),public.web_submission_expire_sessions(),public.web_analysis_material(uuid,uuid,uuid,jsonb),public.web_submission_cleanup_finish(uuid,uuid,uuid,boolean),public.web_submission_commit(uuid,uuid),public.web_update_v2_source(uuid,uuid,integer,integer,uuid,jsonb),public.web_exclude_v2_source(uuid,uuid,uuid,integer,uuid),public.web_queue_v2_run(uuid,uuid,uuid,integer,integer,jsonb,text,jsonb),public.web_cancel_v2_run(uuid,uuid,uuid),public.web_initial_next(),public.web_initial_prepare(uuid,uuid,integer,jsonb),public.web_submission_access(uuid,uuid),public.web_apply_v2_reanalysis(uuid,uuid,uuid,integer,jsonb,text[],boolean),public.web_save_editor_v2(uuid,uuid,integer,jsonb,text[]),public.web_property_overview(uuid,text,text,integer,integer,text) TO service_role;
COMMIT;
