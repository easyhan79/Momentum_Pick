BEGIN;
CREATE TABLE public.property_analysis_jobs (
 property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE RESTRICT,
 state text NOT NULL DEFAULT 'waiting' CHECK(state IN ('waiting','running','done','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 claim_token uuid,
 last_error_code text NOT NULL DEFAULT '' CHECK(length(last_error_code)<=60),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX property_analysis_jobs_due_idx ON public.property_analysis_jobs(next_attempt_at) WHERE state IN ('waiting','running');
ALTER TABLE public.property_analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_analysis_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_analysis_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.property_analysis_jobs TO service_role;

CREATE FUNCTION public.analysis_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE chosen uuid; claimed public.property_analysis_jobs;
BEGIN
 INSERT INTO public.property_analysis_jobs(property_id)
 SELECT id FROM public.properties WHERE status='pending' ON CONFLICT DO NOTHING;
 UPDATE public.property_analysis_jobs SET state='failed',last_error_code='lease_exhausted',claim_token=NULL,lease_until=NULL,updated_at=now()
 WHERE state='running' AND lease_until<now() AND attempts>=5;
 SELECT q.property_id INTO chosen FROM public.property_analysis_jobs q
 JOIN public.properties p ON p.id=q.property_id
 WHERE p.status='pending' AND q.attempts<5 AND q.next_attempt_at<=now()
 AND (q.state='waiting' OR (q.state='running' AND q.lease_until<now()))
 ORDER BY (p.raw_input LIKE '%[FILE_ID:%'),p.created_at
 LIMIT 1 FOR UPDATE OF q SKIP LOCKED;
 IF chosen IS NULL THEN RETURN NULL; END IF;
 UPDATE public.property_analysis_jobs SET state='running',attempts=attempts+1,
 claim_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',updated_at=now()
 WHERE property_id=chosen RETURNING * INTO claimed;
 RETURN (SELECT jsonb_build_object('id',p.id,'raw_input',p.raw_input,'attempt',claimed.attempts,'token',claimed.claim_token) FROM public.properties p WHERE p.id=chosen);
END $$;

CREATE FUNCTION public.analysis_complete(p_id uuid,p_token uuid,p_result jsonb,p_error text DEFAULT '',p_retryable boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.property_analysis_jobs;
BEGIN
 SELECT * INTO job FROM public.property_analysis_jobs WHERE property_id=p_id FOR UPDATE;
 IF NOT FOUND OR job.state<>'running' OR job.claim_token IS DISTINCT FROM p_token THEN RETURN false; END IF;
 IF p_result IS NOT NULL THEN
  IF jsonb_typeof(p_result)<>'object' OR jsonb_typeof(p_result->'usp_summary') IS DISTINCT FROM 'string'
   OR jsonb_typeof(p_result->'landing_copy') IS DISTINCT FROM 'string'
   OR jsonb_typeof(p_result->'showroom_concepts') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_analysis'; END IF;
  UPDATE public.properties SET ai_contents=p_result,status='analyzed' WHERE id=p_id AND status='pending';
  UPDATE public.property_analysis_jobs SET state='done',last_error_code='',claim_token=NULL,lease_until=NULL,updated_at=now() WHERE property_id=p_id;
 ELSE
  IF p_error !~ '^[a-z0-9_]{1,60}$' THEN RAISE EXCEPTION 'invalid_error_code'; END IF;
  UPDATE public.property_analysis_jobs SET
   state=CASE WHEN p_retryable AND job.attempts<5 THEN 'waiting' ELSE 'failed' END,
   next_attempt_at=now()+make_interval(mins=>CASE job.attempts WHEN 1 THEN 5 WHEN 2 THEN 15 WHEN 3 THEN 30 ELSE 60 END),
   last_error_code=p_error,claim_token=NULL,lease_until=NULL,updated_at=now() WHERE property_id=p_id;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.analysis_claim() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.analysis_complete(uuid,uuid,jsonb,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analysis_claim() TO service_role;
GRANT EXECUTE ON FUNCTION public.analysis_complete(uuid,uuid,jsonb,text,boolean) TO service_role;
COMMIT;
