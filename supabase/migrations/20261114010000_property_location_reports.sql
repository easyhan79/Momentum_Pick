-- Stage 4 (location analysis): one location report per listing, built by the web worker from
-- public map/data APIs (first source: Kakao Local). The report keeps the address it was built
-- from, so a changed address makes it stale and the worker rebuilds it. Values come from the
-- providers as-is; the AI only interprets them. Service role only: the admin API and the worker
-- read and write it, browsers never touch the table directly.
BEGIN;

CREATE TABLE IF NOT EXISTS public.property_location_reports (
  property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  address text NOT NULL CHECK (length(address) BETWEEN 1 AND 300),
  state text NOT NULL CHECK (state IN ('done','not_found','failed')),
  report jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(report)='object' AND pg_column_size(report)<=65536),
  error_code text NOT NULL DEFAULT '' CHECK (length(error_code)<=80),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.property_location_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_location_reports FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.property_location_reports TO service_role;

-- The address a report should describe: the draft's address, else the property record's.
CREATE OR REPLACE FUNCTION public.location_current_address(p_property uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT NULLIF(btrim(COALESCE(NULLIF(btrim(s.draft_content->>'address'),''),p.address,'')),'')
 FROM public.properties p LEFT JOIN public.property_showrooms s ON s.property_id=p.id
 WHERE p.id=p_property
$function$;

-- Next listing whose report is missing or describes another address. A failed fetch is retried
-- after an hour (at most 5 times per address); "not found" waits until the address changes;
-- a good report is refreshed after 90 days because shops and facilities change.
-- p_sections lists the sections the worker can now build (e.g. kakao, commerce, building): a report
-- without one of them is rebuilt, and a section that was unavailable (key not approved yet) is
-- retried after a day.
CREATE OR REPLACE FUNCTION public.location_report_next(p_sections text[] DEFAULT '{}')
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object('property_id',c.id,'address',c.address)
 FROM (
   SELECT p.id,public.location_current_address(p.id) AS address,p.created_at
   FROM public.properties p
   WHERE p.status IS DISTINCT FROM 'merged'
 ) c
 LEFT JOIN public.property_location_reports r ON r.property_id=c.id
 WHERE c.address IS NOT NULL AND length(c.address)<=300
   AND (r.property_id IS NULL OR r.address<>c.address
        OR r.state='failed' AND r.attempts<5 AND r.updated_at<now()-interval '1 hour'
        OR r.state='done' AND r.fetched_at<now()-interval '90 days'
        OR r.state='done' AND EXISTS(SELECT 1 FROM unnest(p_sections) n
             WHERE r.report->'sections'->>n IS NULL OR r.report->'sections'->>n<>'done' AND r.fetched_at<now()-interval '1 day'))
 ORDER BY (r.property_id IS NULL) DESC,c.created_at DESC
 LIMIT 1
$function$;

-- Saves a result only if the listing still has the address it was fetched for.
CREATE OR REPLACE FUNCTION public.location_report_save(p_property uuid,p_address text,p_state text,p_report jsonb,p_error text DEFAULT '')
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF p_state NOT IN ('done','not_found','failed') OR p_report IS NULL OR jsonb_typeof(p_report)<>'object' THEN RAISE EXCEPTION 'location_report_invalid'; END IF;
 IF public.location_current_address(p_property) IS DISTINCT FROM p_address THEN RETURN false; END IF;
 INSERT INTO public.property_location_reports AS r(property_id,address,state,report,error_code,attempts,fetched_at,updated_at)
 VALUES(p_property,p_address,p_state,CASE WHEN p_state='done' THEN p_report ELSE '{}'::jsonb END,left(COALESCE(p_error,''),80),CASE WHEN p_state='failed' THEN 1 ELSE 0 END,now(),now())
 ON CONFLICT (property_id) DO UPDATE SET
   address=excluded.address,state=excluded.state,error_code=excluded.error_code,updated_at=now(),
   -- A failed refresh keeps the last good report for the same address.
   report=CASE WHEN excluded.state='done' THEN excluded.report WHEN r.address=excluded.address AND excluded.state='failed' THEN r.report ELSE '{}'::jsonb END,
   fetched_at=CASE WHEN excluded.state='done' THEN now() ELSE r.fetched_at END,
   attempts=CASE WHEN excluded.state<>'failed' THEN 0 WHEN r.address=excluded.address THEN r.attempts+1 ELSE 1 END;
 RETURN true;
END $function$;

REVOKE ALL ON FUNCTION public.location_current_address(uuid),public.location_report_next(text[]),public.location_report_save(uuid,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.location_current_address(uuid),public.location_report_next(text[]),public.location_report_save(uuid,text,text,jsonb,text) TO service_role;

COMMIT;
