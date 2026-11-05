BEGIN;
-- Imported raster documents are private generation references, not public gallery assets.
CREATE OR REPLACE FUNCTION public.image_enqueue(p_property uuid,p_slot text DEFAULT 'hero',p_retry boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b public.property_image_budgets;j public.property_image_jobs;
BEGIN
 IF p_slot NOT IN ('hero','concept-1','concept-2','concept-3') THEN RAISE EXCEPTION 'invalid_slot';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.property_showrooms WHERE property_id=p_property) THEN RAISE EXCEPTION 'draft_missing';END IF;
 IF p_slot<>'hero' AND NOT EXISTS(SELECT 1 FROM public.property_showrooms s,jsonb_array_elements(s.draft_content->'concepts') c WHERE s.property_id=p_property AND c->>'id'=p_slot) THEN RAISE EXCEPTION 'concept_missing';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.property_assets WHERE property_id=p_property AND bucket_id='showroom-private-media' AND source_type<>'ai_generated' AND (kind IN ('photo','provided_plan') OR (kind='document' AND source_type IN ('owner_provided','photographed') AND storage_path ~ ('^'||p_property::text||'/[0-9a-f-]+\.(jpg|png|webp)$')))) THEN RAISE EXCEPTION 'source_missing';END IF;
 INSERT INTO public.property_image_budgets(property_id) VALUES(p_property) ON CONFLICT DO NOTHING;
 SELECT * INTO b FROM public.property_image_budgets WHERE property_id=p_property FOR UPDATE;
 INSERT INTO public.property_image_jobs(property_id,slot) VALUES(p_property,p_slot) ON CONFLICT DO NOTHING;
 SELECT * INTO j FROM public.property_image_jobs WHERE property_id=p_property AND slot=p_slot FOR UPDATE;
 IF j.state='running' AND j.lease_until<now() THEN UPDATE public.property_image_jobs SET state='failed',claim_token=NULL,last_error_code='lease_expired' WHERE id=j.id RETURNING * INTO j;END IF;
 IF p_retry AND j.state IN ('failed','budget_blocked') AND b.reserved_krw+500<=b.limit_krw THEN
  UPDATE public.property_image_jobs SET state='queued',last_error_code='',updated_at=now() WHERE id=j.id RETURNING * INTO j;
 END IF;
 RETURN to_jsonb(j);
END $$;

COMMIT;
