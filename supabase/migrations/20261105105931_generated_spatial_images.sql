BEGIN;
-- Imported raster documents are private generation references, not public gallery assets.
CREATE OR REPLACE FUNCTION public.image_enqueue(p_property uuid,p_slot text DEFAULT 'hero',p_retry boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b public.property_image_budgets;j public.property_image_jobs;
BEGIN
 IF p_slot NOT IN ('hero','concept-1','concept-2','concept-3') THEN RAISE EXCEPTION 'invalid_slot';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.property_showrooms WHERE property_id=p_property) THEN RAISE EXCEPTION 'draft_missing';END IF;
 IF p_slot<>'hero' AND NOT EXISTS(SELECT 1 FROM public.property_showrooms s,jsonb_array_elements(s.draft_content->'concepts') c WHERE s.property_id=p_property AND c->>'id'=p_slot) THEN RAISE EXCEPTION 'concept_missing';END IF;
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

CREATE OR REPLACE FUNCTION public.image_sync_assets(p_property uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE media jsonb;hero jsonb;
BEGIN
 PERFORM 1 FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 SELECT coalesce(jsonb_agg(item ORDER BY sort_order,created_at),'[]'::jsonb) INTO media FROM (
 SELECT a.created_at,CASE WHEN j.slot='hero' THEN 0 WHEN a.source_type='ai_generated' THEN 2 ELSE 1 END sort_order,
 jsonb_build_object('id',a.id,'url','','alt',a.caption,'caption',a.caption,'kind',CASE WHEN a.kind='document' THEN 'photo' ELSE a.kind END,'zoning',coalesce(j.usage->'zoning','[]'::jsonb),'approved',false,'generated',a.source_type='ai_generated','conceptId',CASE WHEN j.slot<>'hero' THEN j.slot ELSE NULL END) item
 FROM public.property_assets a LEFT JOIN public.property_image_jobs j ON j.asset_id=a.id AND j.state='done'
 WHERE a.property_id=p_property AND a.bucket_id='showroom-private-media' AND
 (a.source_type='ai_generated' AND j.id IS NOT NULL)
 ORDER BY a.created_at LIMIT 24) selected;
 SELECT item INTO hero FROM jsonb_array_elements(media) item JOIN public.property_image_jobs j ON j.asset_id=(item->>'id')::uuid WHERE j.property_id=p_property AND j.slot='hero' AND j.state='done';
 UPDATE public.property_showrooms SET draft_content=draft_content||jsonb_build_object('assets',media)||CASE WHEN hero IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('heroAsset',hero) END,revision=revision+1
 WHERE property_id=p_property AND (draft_content->'assets' IS DISTINCT FROM media OR (hero IS NOT NULL AND draft_content->'heroAsset' IS DISTINCT FROM hero));
END $$;


COMMIT;