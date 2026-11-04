BEGIN;
ALTER TABLE public.property_showrooms ADD COLUMN listing_state text NOT NULL DEFAULT 'active' CHECK(listing_state IN ('active','closed'));
ALTER TABLE public.property_showrooms ADD COLUMN closed_at timestamptz;
CREATE TABLE public.property_showroom_routes(
 slug text PRIMARY KEY CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 120),
 property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX property_showroom_routes_property_idx ON public.property_showroom_routes(property_id);
INSERT INTO public.property_showroom_routes(slug,property_id) SELECT slug,property_id FROM public.property_showrooms;
ALTER TABLE public.property_showroom_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_showroom_routes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_showroom_routes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.property_showroom_routes TO service_role;

CREATE FUNCTION public.spacepick_register_route() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 INSERT INTO public.property_showroom_routes(slug,property_id) VALUES(NEW.slug,NEW.property_id) ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.property_showroom_routes WHERE slug=NEW.slug AND property_id=NEW.property_id) THEN RAISE EXCEPTION 'slug_taken';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER spacepick_route AFTER INSERT OR UPDATE OF slug ON public.property_showrooms FOR EACH ROW EXECUTE FUNCTION public.spacepick_register_route();

CREATE FUNCTION public.spacepick_set_slug(p_property uuid,p_slug text,p_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE room public.property_showrooms;
BEGIN
 IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(p_slug) NOT BETWEEN 3 AND 64 OR p_slug=ANY(ARRAY['admin','api','assets','about','contact','samples','login','reset','signin-with-chatgpt','signout-with-chatgpt','callback','robots','sitemap']) THEN RAISE EXCEPTION 'invalid_slug';END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND OR room.revision<>p_revision THEN RAISE EXCEPTION 'revision_conflict';END IF;
 IF room.slug=p_slug THEN RETURN to_jsonb(room);END IF;
 IF EXISTS(SELECT 1 FROM public.property_showroom_routes WHERE slug=p_slug AND property_id<>p_property) THEN RAISE EXCEPTION 'slug_taken';END IF;
 UPDATE public.property_showrooms SET slug=p_slug,revision=revision+1 WHERE property_id=p_property RETURNING * INTO room;
 RETURN to_jsonb(room);
END $$;
CREATE FUNCTION public.spacepick_resolve_slug(p_slug text) RETURNS TABLE(property_id uuid,slug text,listing_state text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT s.property_id,s.slug,s.listing_state FROM public.property_showroom_routes r JOIN public.property_showrooms s ON s.property_id=r.property_id WHERE r.slug=p_slug AND s.showroom_status='published' LIMIT 1
$$;
CREATE FUNCTION public.spacepick_set_listing_state(p_property uuid,p_state text,p_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE room public.property_showrooms;
BEGIN
 IF p_state IS NULL OR p_state NOT IN ('active','closed') THEN RAISE EXCEPTION 'invalid_listing_state';END IF;
 UPDATE public.property_showrooms SET listing_state=p_state,closed_at=CASE WHEN p_state='closed' THEN now() ELSE NULL END,revision=revision+1 WHERE property_id=p_property AND revision=p_revision RETURNING * INTO room;
 IF NOT FOUND THEN RAISE EXCEPTION 'revision_conflict';END IF;
 RETURN to_jsonb(room);
END $$;
REVOKE ALL ON FUNCTION public.spacepick_register_route(),public.spacepick_set_slug(uuid,text,integer),public.spacepick_resolve_slug(text),public.spacepick_set_listing_state(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spacepick_register_route(),public.spacepick_set_slug(uuid,text,integer),public.spacepick_resolve_slug(text),public.spacepick_set_listing_state(uuid,text,integer) TO service_role;
-- Existing public inquiry function is replaced below with the same contract,
-- resolving historical aliases and locking out new public leads after closure.
CREATE OR REPLACE FUNCTION public.crm_register_inquiry(p_request_id uuid,p_fingerprint text,p_rate_key text,p_slug text,p_property_id uuid,p_admin boolean,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE existing public.property_inquiries%ROWTYPE; room public.property_showrooms%ROWTYPE; created uuid; rate_count integer;
BEGIN
 IF length(p_fingerprint)<>64 THEN RAISE EXCEPTION 'invalid_request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO existing FROM public.property_inquiries WHERE request_id=p_request_id;
 IF FOUND THEN
  IF existing.request_fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'request_conflict'; END IF;
  RETURN jsonb_build_object('id',existing.id,'existing',true);
 END IF;
 IF p_admin THEN
  SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property_id FOR SHARE;
 ELSE
  SELECT * INTO room FROM public.property_showrooms WHERE property_id=(SELECT r.property_id FROM public.property_showroom_routes r WHERE r.slug=p_slug) AND showroom_status='published' AND listing_state='active' AND approved_at IS NOT NULL FOR SHARE;
 END IF;
 IF room.id IS NULL THEN RAISE EXCEPTION 'showroom_unavailable'; END IF;
 IF NOT p_admin THEN
  INSERT INTO public.inquiry_request_limits(rate_key,window_start,request_count)
   VALUES(p_rate_key,to_timestamp(floor(extract(epoch FROM now())/600)*600),1)
   ON CONFLICT(rate_key,window_start) DO UPDATE SET request_count=public.inquiry_request_limits.request_count+1
   RETURNING request_count INTO rate_count;
  IF rate_count>5 THEN RAISE EXCEPTION 'rate_limited'; END IF;
 END IF;
 INSERT INTO public.property_inquiries(property_id,showroom_id,request_id,request_fingerprint,name,phone,deal_type,intended_use,memo,consent_version,consented_at,service_interest,source_channel)
 VALUES(room.property_id,room.id,p_request_id,p_fingerprint,p_data->>'name',p_data->>'phone',p_data->>'deal_type',p_data->>'intended_use',coalesce(p_data->>'memo',''),p_data->>'consent_version',now(),p_data->>'service_interest',p_data->>'source_channel') RETURNING id INTO created;
 RETURN jsonb_build_object('id',created,'existing',false);
END; $$;


COMMIT;
