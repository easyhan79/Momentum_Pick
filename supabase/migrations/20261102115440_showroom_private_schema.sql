-- REVIEW ONLY until production backup, schema audit and approval are recorded.
-- Additive schema. Does not alter public.properties or its existing rows/grants.
-- No browser role receives direct access. Later APIs must authenticate/authorize.
BEGIN;

CREATE TABLE IF NOT EXISTS public.property_showrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL UNIQUE REFERENCES public.properties(id) ON DELETE RESTRICT,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 120),
  showroom_status text NOT NULL DEFAULT 'draft' CHECK (showroom_status IN ('draft','in_review','published','unpublished')),
  draft_content jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(draft_content) = 'object'),
  published_content jsonb CHECK (published_content IS NULL OR jsonb_typeof(published_content) = 'object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  published_revision integer CHECK (published_revision > 0 AND published_revision <= revision),
  approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_showrooms_id_property_unique UNIQUE (id,property_id),
  CONSTRAINT published_snapshot_requires_approval CHECK (
    showroom_status <> 'published' OR (
      published_content IS NOT NULL AND published_content <> '{}'::jsonb
      AND published_revision IS NOT NULL AND approved_by IS NOT NULL
      AND approved_at IS NOT NULL AND published_at IS NOT NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS public.property_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('photo','provided_plan','concept','example','document')),
  bucket_id text NOT NULL CHECK (length(btrim(bucket_id)) BETWEEN 1 AND 100),
  storage_path text NOT NULL CHECK (
    length(btrim(storage_path)) BETWEEN 1 AND 1024
    AND storage_path !~ '(^|/)\.\.(/|$)'
    AND storage_path !~ '^(https?:|/)'
  ),
  source_type text NOT NULL CHECK (source_type IN ('owner_provided','photographed','licensed_example','ai_generated')),
  caption text NOT NULL DEFAULT '' CHECK (length(caption) <= 2000),
  is_approved boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id,storage_path)
);

CREATE TABLE IF NOT EXISTS public.property_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  showroom_id uuid NOT NULL,
  request_id uuid NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  phone text NOT NULL CHECK (phone ~ '^\+?[0-9 ()-]{7,30}$'),
  deal_type text NOT NULL CHECK (deal_type IN ('rent','buy','both')),
  intended_use text NOT NULL CHECK (length(btrim(intended_use)) BETWEEN 1 AND 200),
  memo text NOT NULL DEFAULT '' CHECK (length(memo) <= 2000),
  consent_version text NOT NULL CHECK (length(btrim(consent_version)) BETWEEN 1 AND 50),
  consented_at timestamptz NOT NULL,
  notification_status text NOT NULL DEFAULT 'pending' CHECK (notification_status IN ('pending','sent','failed')),
  notification_attempts integer NOT NULL DEFAULT 0 CHECK (notification_attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inquiry_showroom_property_fk FOREIGN KEY (showroom_id,property_id)
    REFERENCES public.property_showrooms(id,property_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS property_showrooms_status_updated_idx ON public.property_showrooms(showroom_status,updated_at DESC);
CREATE INDEX IF NOT EXISTS property_assets_property_order_idx ON public.property_assets(property_id,display_order);
CREATE INDEX IF NOT EXISTS property_inquiries_property_created_idx ON public.property_inquiries(property_id,created_at DESC);
CREATE INDEX IF NOT EXISTS property_inquiries_showroom_property_idx ON public.property_inquiries(showroom_id,property_id);
CREATE INDEX IF NOT EXISTS property_inquiries_notifications_idx ON public.property_inquiries(notification_status,created_at)
  WHERE notification_status IN ('pending','failed');

CREATE OR REPLACE FUNCTION public.showroom_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.showroom_set_updated_at() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.showroom_set_updated_at() TO service_role;
DROP TRIGGER IF EXISTS showroom_updated_at ON public.property_showrooms;
CREATE TRIGGER showroom_updated_at BEFORE UPDATE ON public.property_showrooms
FOR EACH ROW EXECUTE FUNCTION public.showroom_set_updated_at();

ALTER TABLE public.property_showrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_showrooms FORCE ROW LEVEL SECURITY;
ALTER TABLE public.property_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.property_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_inquiries FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.property_showrooms,public.property_assets,public.property_inquiries FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.property_showrooms,public.property_assets,public.property_inquiries TO service_role;
COMMIT;
