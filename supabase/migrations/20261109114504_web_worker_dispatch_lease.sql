-- Recovered from production (supabase_migrations.schema_migrations, project aklcylhqslgntkgloqpi) on 2026-11-13.
-- Applied in production on 20261109; the original file was never committed to this repository.
BEGIN;

CREATE TABLE public.web_worker_dispatch_leases (
  environment text PRIMARY KEY CHECK (environment = 'production'),
  reserved_until timestamptz NOT NULL
);
ALTER TABLE public.web_worker_dispatch_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_worker_dispatch_leases FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_worker_dispatch_leases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.web_worker_dispatch_leases TO service_role;

CREATE FUNCTION public.web_reserve_worker_dispatch(p_property uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.property_analysis_jobs j
    JOIN public.property_processing_runs r ON r.id = j.run_id
    WHERE j.property_id = p_property AND j.executor_kind = 'web_worker'
      AND j.state = 'waiting' AND j.next_attempt_at <= now()
      AND j.executor_epoch = r.executor_epoch AND r.is_v2_submission
      AND r.state IN ('queued', 'running') AND (j.attempts < 5 OR r.candidate IS NOT NULL)
  ) OR EXISTS (
    SELECT 1 FROM public.web_worker_heartbeats
    WHERE environment = 'production' AND 'analysis_v2' = ANY(capabilities)
      AND last_seen > now() - interval '60 seconds'
  ) THEN
    RETURN false;
  END IF;

  -- A durable reservation covers the interval before GitHub starts a worker.
  INSERT INTO public.web_worker_dispatch_leases AS lease (environment, reserved_until)
  VALUES ('production', now() + interval '2 minutes')
  ON CONFLICT (environment) DO UPDATE SET reserved_until = EXCLUDED.reserved_until
    WHERE lease.reserved_until <= now();
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.web_reserve_worker_dispatch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_reserve_worker_dispatch(uuid) TO service_role;

COMMIT;
