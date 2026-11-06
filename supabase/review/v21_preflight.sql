-- READ ONLY. Review actual migration history separately; no production writes.
SELECT to_regclass('public.property_showrooms') AS showrooms,
       to_regclass('public.property_inquiries') AS inquiries,
       to_regclass('public.property_showroom_routes') AS routes;
SELECT column_name,data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name='property_showrooms'
 AND column_name IN ('listing_state','draft_content','published_content','revision','published_revision','approved_by','approved_at','published_at') ORDER BY column_name;
SELECT to_regprocedure('public.crm_register_inquiry(uuid,text,text,text,uuid,boolean,jsonb)') AS legacy_register,
       to_regprocedure('public.crm_register_context_inquiry(uuid,text,text,text,uuid,integer,jsonb)') AS contextual_register,
       to_regprocedure('public.crm_retention_cleanup()') AS retention_cleanup;
SELECT CASE WHEN to_regprocedure('public.crm_register_context_inquiry(uuid,text,text,text,uuid,integer,jsonb)') IS NULL THEN NULL ELSE
 has_function_privilege('anon','public.crm_register_context_inquiry(uuid,text,text,text,uuid,integer,jsonb)','EXECUTE') END AS anon_must_be_false,
 CASE WHEN to_regprocedure('public.crm_register_context_inquiry(uuid,text,text,text,uuid,integer,jsonb)') IS NULL THEN NULL ELSE
 has_function_privilege('authenticated','public.crm_register_context_inquiry(uuid,text,text,text,uuid,integer,jsonb)','EXECUTE') END AS authenticated_must_be_false;
