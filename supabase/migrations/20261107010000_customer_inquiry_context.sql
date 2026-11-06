BEGIN;
-- Additive wrapper: preserve the existing CRM, retention, notification and limits.
-- Pin the exact approved property/revision while the existing register RPC writes.
CREATE FUNCTION public.crm_register_context_inquiry(p_request_id uuid,p_fingerprint text,p_rate_key text,p_slug text,p_expected_property uuid,p_expected_revision integer,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE room public.property_showrooms; existing public.property_inquiries;
BEGIN
 IF p_request_id IS NULL OR p_expected_property IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 OR p_fingerprint IS NULL OR length(p_fingerprint)<>64 THEN RAISE EXCEPTION 'invalid_request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO existing FROM public.property_inquiries WHERE request_id=p_request_id;
 IF FOUND THEN
  IF existing.request_fingerprint<>p_fingerprint OR existing.property_id<>p_expected_property THEN RAISE EXCEPTION 'request_conflict'; END IF;
  RETURN jsonb_build_object('id',existing.id,'existing',true);
 END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE slug=p_slug AND showroom_status='published' AND listing_state='active' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND published_at IS NOT NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'showroom_unavailable'; END IF;
 IF room.property_id<>p_expected_property THEN RAISE EXCEPTION 'context_property_mismatch'; END IF;
 IF room.published_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'context_revision_conflict'; END IF;
 RETURN public.crm_register_inquiry(p_request_id,p_fingerprint,p_rate_key,p_slug,NULL,false,p_data);
END $$;
REVOKE ALL ON FUNCTION public.crm_register_context_inquiry(uuid,text,text,text,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_register_context_inquiry(uuid,text,text,text,uuid,integer,jsonb) TO service_role;
COMMIT;
