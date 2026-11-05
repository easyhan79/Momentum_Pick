BEGIN;
-- Lock ordering follows existing workers: budget -> jobs -> showroom.
CREATE FUNCTION public.showroom_save_concept_draft(p_property uuid,p_revision integer,p_content jsonb,p_slots text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE room public.property_showrooms; result public.property_showrooms; changed_assets uuid[];
BEGIN
 IF p_property IS NULL OR p_revision IS NULL OR p_revision<1 OR p_slots IS NULL OR cardinality(p_slots)>7
 OR jsonb_typeof(p_content) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_concepts';END IF;
 PERFORM 1 FROM public.property_image_budgets WHERE property_id=p_property FOR UPDATE;
 PERFORM 1 FROM public.property_image_jobs WHERE property_id=p_property AND slot=ANY(p_slots) ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.property_image_jobs WHERE property_id=p_property AND slot=ANY(p_slots) AND state='running') THEN RAISE EXCEPTION 'concept_image_busy';END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft_missing';END IF;
 IF room.revision<>p_revision THEN RAISE EXCEPTION 'revision_conflict';END IF;
 SELECT coalesce(array_agg(asset_id) FILTER(WHERE asset_id IS NOT NULL),'{}'::uuid[]) INTO changed_assets FROM public.property_image_jobs WHERE property_id=p_property AND slot=ANY(p_slots);
 UPDATE public.property_image_jobs SET state='failed',asset_id=NULL,claim_token=NULL,lease_until=NULL,last_error_code='concept_changed',updated_at=now()
 WHERE property_id=p_property AND slot=ANY(p_slots);
 -- Original assets and usage/budget records are retained privately.
 p_content:=jsonb_set(p_content,'{assets}',coalesce((SELECT jsonb_agg(a) FROM jsonb_array_elements(coalesce(p_content->'assets','[]'::jsonb)) a WHERE NOT(coalesce(a->>'conceptId','')=ANY(p_slots)) AND NOT(coalesce(a->>'id','')=ANY(SELECT x::text FROM unnest(changed_assets) x))),'[]'::jsonb));
 IF 'hero'=ANY(p_slots) THEN p_content:=p_content-'heroAsset';END IF;
 UPDATE public.property_showrooms SET draft_content=p_content,revision=revision+1 WHERE property_id=p_property RETURNING * INTO result;
 RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION public.showroom_save_concept_draft(uuid,integer,jsonb,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.showroom_save_concept_draft(uuid,integer,jsonb,text[]) TO service_role;
COMMIT;
