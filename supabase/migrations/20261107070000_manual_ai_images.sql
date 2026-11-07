BEGIN;
ALTER TABLE public.property_assets ADD COLUMN ai_metadata jsonb CHECK(ai_metadata IS NULL OR jsonb_typeof(ai_metadata)='object' AND octet_length(ai_metadata::text)<=20000);
ALTER FUNCTION public.image_sync_assets(uuid) RENAME TO image_sync_assets_before_manual;
CREATE FUNCTION public.image_sync_assets(p_property uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE room public.property_showrooms;original public.property_showrooms;content jsonb;media jsonb;item jsonb;entry record;slots jsonb;
BEGIN
 SELECT * INTO original FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 PERFORM public.image_sync_assets_before_manual(p_property);
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property;
 slots:=COALESCE(room.draft_content->'imagePolicy'->'manualSlots','{}'::jsonb);
 IF slots='{}'::jsonb THEN
  IF room.draft_content->'heroAsset'->>'manualSelected'='true' THEN UPDATE public.property_showrooms SET draft_content=draft_content-'heroAsset' WHERE property_id=p_property; END IF;
  UPDATE public.property_showrooms SET revision=original.revision+CASE WHEN draft_content IS DISTINCT FROM original.draft_content THEN 1 ELSE 0 END WHERE property_id=p_property;
  RETURN;
 END IF;
 content:=room.draft_content;media:=COALESCE(content->'assets','[]'::jsonb);
 IF NOT slots ? 'hero' AND content->'heroAsset'->>'manualSelected'='true' THEN content:=content-'heroAsset'; END IF;
 FOR entry IN SELECT j.key,a.* FROM jsonb_each_text(slots) j JOIN public.property_assets a ON a.id::text=j.value WHERE a.property_id=p_property AND a.source_type='ai_generated' AND a.bucket_id='showroom-private-media' LOOP
  item:=jsonb_build_object('id',entry.id,'url','','alt',entry.caption,'caption',entry.caption,'kind','concept','imageType',COALESCE(entry.ai_metadata->>'imageType','concept'),'approved',false,'generated',true,'manualSelected',true,'conceptId',CASE WHEN entry.key<>'hero' THEN entry.key ELSE NULL END);
  media:=COALESCE((SELECT jsonb_agg(a) FROM jsonb_array_elements(media) a WHERE a->>'id'<>entry.id::text AND (entry.key='hero' OR a->>'conceptId' IS DISTINCT FROM entry.key)),'[]'::jsonb)||jsonb_build_array(item);
  IF entry.key='hero' THEN content:=jsonb_set(content,'{heroAsset}',item); END IF;
 END LOOP;
 content:=jsonb_set(content,'{assets}',media);
 UPDATE public.property_showrooms SET draft_content=content,revision=original.revision+CASE WHEN content IS DISTINCT FROM original.draft_content THEN 1 ELSE 0 END WHERE property_id=p_property;
END $$;

ALTER FUNCTION public.image_enqueue(uuid,text,boolean) RENAME TO image_enqueue_before_manual;
CREATE FUNCTION public.image_enqueue(p_property uuid,p_slot text DEFAULT 'hero',p_retry boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('manual-image:'||p_property,0));
 IF EXISTS(SELECT 1 FROM public.property_showrooms WHERE property_id=p_property AND draft_content->'imagePolicy'->'manualSlots' ? p_slot) THEN RAISE EXCEPTION 'manual_image_selected'; END IF;
 RETURN public.image_enqueue_before_manual(p_property,p_slot,p_retry);
END $$;
ALTER FUNCTION public.showroom_save_concept_draft(uuid,integer,jsonb,text[]) RENAME TO showroom_save_concept_before_manual;
CREATE FUNCTION public.showroom_save_concept_draft(p_property uuid,p_revision integer,p_content jsonb,p_slots text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE slot text;
BEGIN
 FOREACH slot IN ARRAY p_slots LOOP
  IF p_content->'imagePolicy'->'manualSlots' ? slot THEN p_content:=jsonb_set(p_content,'{imagePolicy,manualSlots}',(p_content->'imagePolicy'->'manualSlots')-slot); END IF;
 END LOOP;
 RETURN public.showroom_save_concept_before_manual(p_property,p_revision,p_content,p_slots);
END $$;
CREATE FUNCTION public.web_select_manual_image(p_property uuid,p_revision integer,p_slot text,p_asset uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE room public.property_showrooms;slots jsonb;
BEGIN
 IF p_slot IS NULL OR p_slot NOT IN ('hero','concept-1','concept-2','concept-3') OR p_revision IS NULL THEN RAISE EXCEPTION 'invalid_slot'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('manual-image:'||p_property,0));
 PERFORM 1 FROM public.property_image_budgets WHERE property_id=p_property FOR UPDATE;
 PERFORM 1 FROM public.property_image_jobs WHERE property_id=p_property AND slot=p_slot FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.property_image_jobs WHERE property_id=p_property AND slot=p_slot AND state='running') THEN RAISE EXCEPTION 'concept_image_busy'; END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft_missing'; END IF;
 IF room.revision<>p_revision THEN RAISE EXCEPTION 'revision_conflict'; END IF;
 IF p_slot<>'hero' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(room.draft_content->'concepts') c WHERE c->>'id'=p_slot) THEN RAISE EXCEPTION 'concept_missing'; END IF;
 IF p_asset IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.property_assets WHERE id=p_asset AND property_id=p_property AND source_type='ai_generated' AND kind='concept' AND ai_metadata->>'rightsApproved'='true' AND bucket_id='showroom-private-media') THEN RAISE EXCEPTION 'invalid_asset'; END IF;
 slots:=COALESCE(room.draft_content->'imagePolicy'->'manualSlots','{}'::jsonb)-p_slot;
 IF p_asset IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM jsonb_each_text(slots) s WHERE s.value=p_asset::text) THEN RAISE EXCEPTION 'manual_image_already_selected'; END IF;
  slots:=slots||jsonb_build_object(p_slot,p_asset);
  UPDATE public.property_image_jobs SET state='failed',claim_token=NULL,lease_until=NULL,last_error_code='manual_selected',updated_at=now() WHERE property_id=p_property AND slot=p_slot AND state='queued';
 END IF;
 UPDATE public.property_showrooms SET draft_content=jsonb_set(draft_content,'{imagePolicy}',COALESCE(draft_content->'imagePolicy','{"version":1,"mode":"manual_web"}'::jsonb)||jsonb_build_object('manualSlots',slots)),revision=revision+1 WHERE property_id=p_property;
 PERFORM public.image_sync_assets(p_property);
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property;
 RETURN to_jsonb(room);
END $$;
ALTER FUNCTION public.image_complete(uuid,uuid,uuid,jsonb,text) RENAME TO image_complete_before_web;
CREATE FUNCTION public.image_complete(p_job uuid,p_token uuid,p_asset uuid DEFAULT NULL,p_usage jsonb DEFAULT '{}'::jsonb,p_error text DEFAULT '') RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.property_image_jobs;
BEGIN
 SELECT * INTO job FROM public.property_image_jobs WHERE id=p_job FOR UPDATE;
 IF NOT FOUND OR job.state<>'running' OR job.claim_token IS DISTINCT FROM p_token OR job.lease_until<now() THEN RETURN false; END IF;
 RETURN public.image_complete_before_web(p_job,p_token,p_asset,p_usage,p_error);
END $$;
REVOKE ALL ON FUNCTION public.image_complete_before_web(uuid,uuid,uuid,jsonb,text),public.image_complete(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.image_complete_before_web(uuid,uuid,uuid,jsonb,text),public.image_complete(uuid,uuid,uuid,jsonb,text) TO service_role;
REVOKE ALL ON FUNCTION public.image_sync_assets_before_manual(uuid),public.image_sync_assets(uuid),public.image_enqueue_before_manual(uuid,text,boolean),public.image_enqueue(uuid,text,boolean),public.showroom_save_concept_before_manual(uuid,integer,jsonb,text[]),public.showroom_save_concept_draft(uuid,integer,jsonb,text[]),public.web_select_manual_image(uuid,integer,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.image_sync_assets_before_manual(uuid),public.image_sync_assets(uuid),public.image_enqueue_before_manual(uuid,text,boolean),public.image_enqueue(uuid,text,boolean),public.showroom_save_concept_before_manual(uuid,integer,jsonb,text[]),public.showroom_save_concept_draft(uuid,integer,jsonb,text[]),public.web_select_manual_image(uuid,integer,text,uuid) TO service_role;
COMMIT;
