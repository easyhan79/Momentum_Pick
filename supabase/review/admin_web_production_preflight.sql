-- Read-only deployment inspection for the opened SpacePick Supabase project.
-- No property contents, emails, keys, file paths or customer data are returned.
-- Do not run application migrations before reviewing this report.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';
WITH expected(name) AS (VALUES
 ('properties'),('property_showrooms'),('property_assets'),('property_inquiries'),
 ('property_showroom_routes'),('property_analysis_jobs'),('property_image_jobs'),
 ('property_image_budgets'),('property_web_intakes'),('property_web_input_versions'),
 ('property_web_intake_writes'),('property_processing_runs'),('property_copy_rewrites'),
 ('web_worker_heartbeats'),('property_web_plan_requests')
), relation_report AS (
 SELECT e.name, c.oid IS NOT NULL AS present,
  c.relrowsecurity AS row_security,c.relforcerowsecurity AS forced_row_security,
  COALESCE((SELECT jsonb_agg(a.attname ORDER BY a.attnum) FROM pg_catalog.pg_attribute a
   WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb) AS columns
 FROM expected e LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=e.name AND c.relkind IN ('r','p')
), routine_report AS (
 SELECT p.proname AS name,pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
  md5(pg_catalog.pg_get_functiondef(p.oid)) AS definition_digest,
  CASE WHEN anonymous.oid IS NULL THEN NULL ELSE has_function_privilege(anonymous.oid,p.oid,'EXECUTE') END AS anon_execute,
  CASE WHEN signed_in.oid IS NULL THEN NULL ELSE has_function_privilege(signed_in.oid,p.oid,'EXECUTE') END AS authenticated_execute
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 LEFT JOIN pg_catalog.pg_roles anonymous ON anonymous.rolname='anon'
 LEFT JOIN pg_catalog.pg_roles signed_in ON signed_in.rolname='authenticated'
 WHERE n.nspname='public' AND p.prokind IN ('f','p')
 AND p.proname ~ '^(web_|analysis_|copy_rewrite_|image_|showroom_save_|spacepick_|crm_)'
)
SELECT jsonb_pretty(jsonb_build_object(
 'captured_at',now(),
 'read_only',current_setting('transaction_read_only'),
 'migration_history_present',to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
 'tables',COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.name) FROM relation_report t),'[]'::jsonb),
 'routines',COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.name,t.arguments) FROM routine_report t),'[]'::jsonb)
)) AS deployment_report;
COMMIT;
