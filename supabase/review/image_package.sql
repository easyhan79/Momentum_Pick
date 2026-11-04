BEGIN;
CREATE TABLE public.property_image_budgets (
 property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE RESTRICT,
 limit_krw integer NOT NULL DEFAULT 2500 CHECK(limit_krw=2500),
 reserved_krw integer NOT NULL DEFAULT 0 CHECK(reserved_krw BETWEEN 0 AND 2500)
);
CREATE TABLE public.property_image_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
 slot text NOT NULL CHECK(slot IN ('hero','concept-1','concept-2','concept-3')),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','done','failed','budget_blocked')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 claim_token uuid,lease_until timestamptz,asset_id uuid REFERENCES public.property_assets(id) ON DELETE RESTRICT,
 last_error_code text NOT NULL DEFAULT '' CHECK(last_error_code ~ '^[a-z0-9_]{0,60}$'),
 usage jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(property_id,slot)
);
CREATE INDEX property_image_jobs_queue_idx ON public.property_image_jobs(updated_at) WHERE state='queued';
ALTER TABLE public.property_image_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_image_budgets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.property_image_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_image_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_image_budgets,public.property_image_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.property_image_budgets,public.property_image_jobs TO service_role;

CREATE FUNCTION public.image_enqueue(p_property uuid,p_slot text DEFAULT 'hero',p_retry boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b public.property_image_budgets;j public.property_image_jobs;
BEGIN
 IF p_slot NOT IN ('hero','concept-1','concept-2','concept-3') THEN RAISE EXCEPTION 'invalid_slot';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.property_showrooms WHERE property_id=p_property) THEN RAISE EXCEPTION 'draft_missing';END IF;
 IF p_slot<>'hero' AND NOT EXISTS(SELECT 1 FROM public.property_showrooms s,jsonb_array_elements(s.draft_content->'concepts') c WHERE s.property_id=p_property AND c->>'id'=p_slot) THEN RAISE EXCEPTION 'concept_missing';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.property_assets WHERE property_id=p_property AND bucket_id='showroom-private-media' AND source_type<>'ai_generated' AND kind IN ('photo','provided_plan')) THEN RAISE EXCEPTION 'source_missing';END IF;
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

CREATE FUNCTION public.image_claim(p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b public.property_image_budgets;j public.property_image_jobs;pid uuid;
BEGIN
 SELECT property_id INTO pid FROM public.property_image_jobs WHERE id=p_job;
 IF pid IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO b FROM public.property_image_budgets WHERE property_id=pid FOR UPDATE;
 SELECT * INTO j FROM public.property_image_jobs WHERE id=p_job FOR UPDATE;
 IF j.state<>'queued' THEN RETURN NULL;END IF;
 IF b.reserved_krw+500>b.limit_krw THEN
  UPDATE public.property_image_jobs SET state='budget_blocked',last_error_code='budget_limit',updated_at=now() WHERE id=p_job;RETURN NULL;
 END IF;
 UPDATE public.property_image_budgets SET reserved_krw=reserved_krw+500 WHERE property_id=pid;
 UPDATE public.property_image_jobs SET state='running',attempts=attempts+1,claim_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',updated_at=now() WHERE id=p_job RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;

CREATE FUNCTION public.image_sync_assets(p_property uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE media jsonb;hero jsonb;
BEGIN
 PERFORM 1 FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 SELECT coalesce(jsonb_agg(item ORDER BY sort_order,created_at),'[]'::jsonb) INTO media FROM (
 SELECT a.created_at,CASE WHEN j.slot='hero' THEN 0 WHEN a.source_type='ai_generated' THEN 2 ELSE 1 END sort_order,
 jsonb_build_object('id',a.id,'url','','alt',a.caption,'caption',a.caption,'kind',CASE WHEN a.kind='document' THEN 'photo' ELSE a.kind END,'approved',false,'generated',a.source_type='ai_generated','conceptId',CASE WHEN j.slot<>'hero' THEN j.slot ELSE NULL END) item
 FROM public.property_assets a LEFT JOIN public.property_image_jobs j ON j.asset_id=a.id AND j.state='done'
 WHERE a.property_id=p_property AND a.bucket_id='showroom-private-media' AND
 ((a.source_type<>'ai_generated' AND a.kind IN ('photo','provided_plan')) OR j.id IS NOT NULL)
 ORDER BY a.created_at LIMIT 24) selected;
 SELECT item INTO hero FROM jsonb_array_elements(media) item JOIN public.property_image_jobs j ON j.asset_id=(item->>'id')::uuid WHERE j.property_id=p_property AND j.slot='hero' AND j.state='done';
 UPDATE public.property_showrooms SET draft_content=draft_content||jsonb_build_object('assets',media)||CASE WHEN hero IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('heroAsset',hero) END,revision=revision+1
 WHERE property_id=p_property AND (draft_content->'assets' IS DISTINCT FROM media OR (hero IS NOT NULL AND draft_content->'heroAsset' IS DISTINCT FROM hero));
END $$;

CREATE FUNCTION public.image_complete(p_job uuid,p_token uuid,p_asset uuid DEFAULT NULL,p_usage jsonb DEFAULT '{}'::jsonb,p_error text DEFAULT '') RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.property_image_jobs;
BEGIN
 SELECT * INTO j FROM public.property_image_jobs WHERE id=p_job FOR UPDATE;
 IF NOT FOUND OR j.state<>'running' OR j.claim_token IS DISTINCT FROM p_token THEN RETURN false;END IF;
 IF p_asset IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.property_assets WHERE id=p_asset AND property_id=j.property_id AND source_type='ai_generated' AND bucket_id='showroom-private-media') THEN RAISE EXCEPTION 'invalid_asset';END IF;
 IF p_error !~ '^[a-z0-9_]{0,60}$' THEN RAISE EXCEPTION 'invalid_error';END IF;
 UPDATE public.property_image_jobs SET state=CASE WHEN p_asset IS NULL THEN 'failed' ELSE 'done' END,asset_id=p_asset,usage=p_usage,last_error_code=p_error,claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=p_job;
 IF p_asset IS NOT NULL THEN PERFORM public.image_sync_assets(j.property_id);END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.image_enqueue(uuid,text,boolean),public.image_claim(uuid),public.image_sync_assets(uuid),public.image_complete(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.image_enqueue(uuid,text,boolean),public.image_claim(uuid),public.image_sync_assets(uuid),public.image_complete(uuid,uuid,uuid,jsonb,text) TO service_role;
COMMIT;
