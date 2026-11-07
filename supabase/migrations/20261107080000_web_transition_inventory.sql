BEGIN;
-- Read-only operational evidence. No source text, contact, asset path or token.
CREATE FUNCTION public.web_transition_inventory() RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object(
  'capturedAt',now(),
  'analysis',COALESCE((SELECT jsonb_agg(t) FROM (SELECT executor_kind,state,count(*) AS count FROM public.property_analysis_jobs GROUP BY executor_kind,state ORDER BY executor_kind,state) t),'[]'::jsonb),
  'rewrites',COALESCE((SELECT jsonb_agg(t) FROM (SELECT executor_kind,state,count(*) AS count FROM public.property_copy_rewrites GROUP BY executor_kind,state ORDER BY executor_kind,state) t),'[]'::jsonb),
  'images',COALESCE((SELECT jsonb_agg(t) FROM (SELECT executor_kind,state,count(*) AS count FROM public.property_image_jobs GROUP BY executor_kind,state ORDER BY executor_kind,state) t),'[]'::jsonb),
  'runs',COALESCE((SELECT jsonb_agg(t) FROM (SELECT state,count(*) AS count FROM public.property_processing_runs GROUP BY state ORDER BY state) t),'[]'::jsonb),
  'plans',COALESCE((SELECT jsonb_agg(t) FROM (SELECT COALESCE(draft_content->'planAnalysis'->>'executorKind','legacy_actions') AS executor_kind,draft_content->'planAnalysis'->>'state' AS state,count(*) AS count FROM public.property_showrooms WHERE draft_content ? 'planAnalysis' GROUP BY 1,2 ORDER BY 1,2) t),'[]'::jsonb),
  'expiredAnalysis', (SELECT count(*) FROM public.property_analysis_jobs WHERE state='running' AND lease_until<now()),
  'pendingCandidates',(SELECT count(*) FROM public.property_processing_runs WHERE candidate IS NOT NULL),
  'legacySourcesMissing',(SELECT count(*) FROM public.property_web_intakes WHERE input_payload IS NULL),
  'imageBudget',(SELECT jsonb_build_object('reserved',COALESCE(sum(reserved_krw),0),'limit',COALESCE(sum(limit_krw),0)) FROM public.property_image_budgets),
  'publishedCount',(SELECT count(*) FROM public.property_showrooms WHERE published_content IS NOT NULL),
  'publishedDigest',(SELECT md5(COALESCE(string_agg(property_id::text||':'||published_revision||':'||published_content::text,'|' ORDER BY property_id),'')) FROM public.property_showrooms WHERE published_content IS NOT NULL),
  'routeViolations',(SELECT count(*) FROM public.property_analysis_jobs WHERE executor_kind='web_worker' AND run_id IS NULL OR executor_kind='legacy_actions' AND run_id IS NOT NULL)
 )
$$;
REVOKE ALL ON FUNCTION public.web_transition_inventory() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.web_transition_inventory() TO service_role;
CREATE FUNCTION public.web_intake_listing(p_actor uuid,p_ids uuid[]) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT COALESCE(jsonb_agg(t),'[]'::jsonb) FROM (
  SELECT i.property_id,s.draft_content->>'title' AS listing_title,s.draft_content->>'address' AS listing_address,
   COALESCE(s.draft_content->'propertyProfile'->>'kind',s.draft_content->>'category') AS listing_kind,
   greatest(i.source_updated_at,s.updated_at) AS saved_at,s.showroom_status AS publication_state,
   r.state AS processing_state,CASE WHEN r.state='done' AND (r.input_revision<>s.revision OR r.source_revision<>i.source_revision) THEN 'needs_review' ELSE r.phase END AS processing_phase,
   s.draft_content->'imagePolicy'->>'mode' AS image_mode,
   (SELECT count(*) FROM jsonb_object_keys(COALESCE(s.draft_content->'imagePolicy'->'manualSlots','{}'::jsonb))) AS manual_images
  FROM public.property_web_intakes i JOIN public.property_showrooms s ON s.property_id=i.property_id
  LEFT JOIN LATERAL (SELECT state,phase,input_revision,source_revision FROM public.property_processing_runs WHERE property_id=i.property_id ORDER BY created_at DESC,id DESC LIMIT 1) r ON true
  WHERE i.created_by=p_actor AND i.property_id=ANY(p_ids) AND cardinality(p_ids)<=100
 ) t
$$;
REVOKE ALL ON FUNCTION public.web_intake_listing(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.web_intake_listing(uuid,uuid[]) TO service_role;
COMMIT;
