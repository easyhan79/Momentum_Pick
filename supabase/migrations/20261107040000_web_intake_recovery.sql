BEGIN;
ALTER TABLE public.property_web_intakes
 ADD COLUMN input_payload jsonb,
 ADD COLUMN source_revision integer NOT NULL DEFAULT 0 CHECK(source_revision>=0),
 ADD COLUMN source_updated_at timestamptz,
 ADD COLUMN creation_input_hash text,
 ADD COLUMN form_closed boolean NOT NULL DEFAULT true;
CREATE TABLE public.property_web_input_versions (
 property_id uuid NOT NULL REFERENCES public.property_web_intakes(property_id) ON DELETE RESTRICT,
 source_revision integer NOT NULL CHECK(source_revision>0),
 input_payload jsonb NOT NULL CHECK(jsonb_typeof(input_payload)='object'),
 updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(property_id,source_revision)
);
CREATE TABLE public.property_web_intake_writes (
 property_id uuid NOT NULL REFERENCES public.property_web_intakes(property_id) ON DELETE RESTRICT,
 request_id uuid NOT NULL,
 fingerprint text NOT NULL,
 applied_revision integer NOT NULL,
 source_revision integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(property_id,request_id)
);
ALTER TABLE public.property_web_input_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_web_input_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.property_web_intake_writes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_web_intake_writes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_web_input_versions,public.property_web_intake_writes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.property_web_input_versions,public.property_web_intake_writes TO service_role;

CREATE FUNCTION public.web_assert_input(p_input jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_input IS NULL OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'web_source_invalid'; END IF;
 IF p_input->>'version' IS DISTINCT FROM '1' OR p_input->>'mode' IS NULL OR p_input->>'mode' NOT IN ('simple','materials')
 OR jsonb_typeof(p_input->'providedText') IS DISTINCT FROM 'string' OR length(p_input->>'providedText')>16000
 OR (SELECT count(*) FROM jsonb_object_keys(p_input))<>3 THEN RAISE EXCEPTION 'web_source_invalid'; END IF;
END $$;

CREATE FUNCTION public.web_intake_receipt(p_actor uuid,p_request uuid DEFAULT NULL,p_property uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE intake public.property_web_intakes; room public.property_showrooms;
BEGIN
 IF p_actor IS NULL OR (p_request IS NULL AND p_property IS NULL) OR (p_request IS NOT NULL AND p_property IS NOT NULL) THEN RAISE EXCEPTION 'invalid_registration'; END IF;
 SELECT * INTO intake FROM public.property_web_intakes WHERE created_by=p_actor AND
 ((p_request IS NOT NULL AND request_id=p_request) OR (p_property IS NOT NULL AND property_id=p_property));
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=intake.property_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('showroom',to_jsonb(room),'receipt',jsonb_build_object(
  'propertyId',intake.property_id,'requestId',intake.request_id,'number','SP-'||replace(intake.property_id::text,'-',''),
  'createdAt',intake.created_at,'sourceUpdatedAt',intake.source_updated_at,'sourceRevision',intake.source_revision,
  'mode',COALESCE(intake.input_payload->>'mode','simple'),'providedText',intake.input_payload->>'providedText',
  'sourceAvailable',intake.input_payload IS NOT NULL,'formClosed',intake.form_closed));
END $$;

CREATE FUNCTION public.web_create_intake(p_request uuid,p_actor uuid,p_content jsonb,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous public.property_web_intakes; created jsonb; chosen uuid; digest text;
BEGIN
 PERFORM public.web_assert_input(p_input);
 IF p_request IS NULL OR p_actor IS NULL THEN RAISE EXCEPTION 'invalid_registration'; END IF;
 digest:=md5(jsonb_build_array(p_content,p_input)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended('web-create:'||p_actor||':'||p_request,0));
 SELECT * INTO previous FROM public.property_web_intakes WHERE created_by=p_actor AND request_id=p_request;
 IF FOUND THEN
  IF previous.creation_input_hash IS DISTINCT FROM digest THEN RAISE EXCEPTION 'registration_request_conflict'; END IF;
  RETURN public.web_intake_receipt(p_actor,p_request)||jsonb_build_object('duplicate',true);
 END IF;
 created:=public.web_create_property(p_request,p_actor,p_content);chosen:=(created->>'property_id')::uuid;
 UPDATE public.property_web_intakes SET input_payload=p_input,source_revision=1,source_updated_at=now(),creation_input_hash=digest,form_closed=false WHERE property_id=chosen;
 INSERT INTO public.property_web_input_versions(property_id,source_revision,input_payload,updated_by) VALUES(chosen,1,p_input,p_actor);
 RETURN public.web_intake_receipt(p_actor,p_request)||jsonb_build_object('duplicate',false);
END $$;

CREATE FUNCTION public.web_find_intake_write(p_property uuid,p_actor uuid,p_revision integer,p_request uuid,p_input jsonb,p_form jsonb,p_finish boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous public.property_web_intake_writes; digest text;
BEGIN
 PERFORM public.web_assert_input(p_input);
 IF NOT EXISTS(SELECT 1 FROM public.property_web_intakes WHERE property_id=p_property AND created_by=p_actor) THEN RAISE EXCEPTION 'web_intake_missing'; END IF;
 SELECT * INTO previous FROM public.property_web_intake_writes WHERE property_id=p_property AND request_id=p_request;
 IF NOT FOUND THEN RETURN NULL; END IF;
 digest:=md5(jsonb_build_array(p_actor,p_revision,p_input,p_form,p_finish)::text);
 IF previous.fingerprint<>digest THEN RAISE EXCEPTION 'web_write_conflict'; END IF;
 RETURN public.web_intake_receipt(p_actor,NULL,p_property)||jsonb_build_object('replayed',true,'appliedRevision',previous.applied_revision);
END $$;

CREATE FUNCTION public.web_save_intake(p_property uuid,p_actor uuid,p_revision integer,p_request uuid,p_input jsonb,p_form jsonb,p_content jsonb,p_finish boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE intake public.property_web_intakes; room public.property_showrooms; previous public.property_web_intake_writes; digest text; next_source integer;
BEGIN
 PERFORM public.web_assert_input(p_input);
 IF p_property IS NULL OR p_actor IS NULL OR p_request IS NULL OR p_revision IS NULL OR p_revision<1 OR p_revision>=2147483647 OR p_finish IS NULL
 OR jsonb_typeof(p_content) IS DISTINCT FROM 'object' OR length(p_content::text)>100000 THEN RAISE EXCEPTION 'invalid_registration'; END IF;
 digest:=md5(jsonb_build_array(p_actor,p_revision,p_input,p_form,p_finish)::text);
 SELECT * INTO intake FROM public.property_web_intakes WHERE property_id=p_property AND created_by=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'web_intake_missing'; END IF;
 SELECT * INTO previous FROM public.property_web_intake_writes WHERE property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF previous.fingerprint<>digest THEN RAISE EXCEPTION 'web_write_conflict'; END IF;
  RETURN public.web_intake_receipt(p_actor,NULL,p_property)||jsonb_build_object('replayed',true,'appliedRevision',previous.applied_revision);
 END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft_missing'; END IF;
 IF intake.form_closed THEN RAISE EXCEPTION 'web_form_closed'; END IF;
 IF room.revision<>p_revision THEN RAISE EXCEPTION 'revision_conflict'; END IF;
 IF jsonb_typeof(p_content->'propertyProfile') IS DISTINCT FROM 'object' OR p_content->'registration'->>'channel' IS DISTINCT FROM 'web' THEN RAISE EXCEPTION 'invalid_registration'; END IF;
 next_source:=intake.source_revision;
 IF intake.input_payload IS DISTINCT FROM p_input THEN
  next_source:=next_source+1;
  INSERT INTO public.property_web_input_versions(property_id,source_revision,input_payload,updated_by) VALUES(p_property,next_source,p_input,p_actor);
 END IF;
 UPDATE public.property_web_intakes SET input_payload=p_input,source_revision=next_source,source_updated_at=now(),form_closed=p_finish WHERE property_id=p_property;
 UPDATE public.property_showrooms SET draft_content=jsonb_set(p_content,'{id}',to_jsonb(p_property::text)),revision=revision+1 WHERE property_id=p_property;
 INSERT INTO public.property_web_intake_writes(property_id,request_id,fingerprint,applied_revision,source_revision) VALUES(p_property,p_request,digest,p_revision+1,next_source);
 RETURN public.web_intake_receipt(p_actor,NULL,p_property)||jsonb_build_object('replayed',false,'appliedRevision',p_revision+1);
END $$;

CREATE FUNCTION public.web_save_source(p_property uuid,p_actor uuid,p_revision integer,p_source_revision integer,p_request uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE intake public.property_web_intakes; room public.property_showrooms; previous public.property_web_intake_writes; digest text; next_source integer;
BEGIN
 PERFORM public.web_assert_input(p_input);
 IF p_property IS NULL OR p_actor IS NULL OR p_request IS NULL OR p_revision IS NULL OR p_revision<1 OR p_revision>=2147483647 OR p_source_revision IS NULL OR p_source_revision<0 THEN RAISE EXCEPTION 'invalid_registration'; END IF;
 digest:=md5(jsonb_build_array('source',p_actor,p_revision,p_source_revision,p_input)::text);
 SELECT * INTO intake FROM public.property_web_intakes WHERE property_id=p_property AND created_by=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'web_intake_missing'; END IF;
 SELECT * INTO previous FROM public.property_web_intake_writes WHERE property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF previous.fingerprint<>digest THEN RAISE EXCEPTION 'web_write_conflict'; END IF;
  RETURN public.web_intake_receipt(p_actor,NULL,p_property)||jsonb_build_object('replayed',true,'appliedRevision',previous.applied_revision);
 END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft_missing'; END IF;
 IF NOT intake.form_closed THEN RAISE EXCEPTION 'web_form_open'; END IF;
 IF room.revision<>p_revision OR intake.source_revision<>p_source_revision THEN RAISE EXCEPTION 'revision_conflict'; END IF;
 next_source:=intake.source_revision;
 IF intake.input_payload IS DISTINCT FROM p_input THEN
  next_source:=next_source+1;
  INSERT INTO public.property_web_input_versions(property_id,source_revision,input_payload,updated_by) VALUES(p_property,next_source,p_input,p_actor);
 END IF;
 UPDATE public.property_web_intakes SET input_payload=p_input,source_revision=next_source,source_updated_at=now() WHERE property_id=p_property;
 UPDATE public.property_showrooms SET revision=revision+1 WHERE property_id=p_property;
 INSERT INTO public.property_web_intake_writes(property_id,request_id,fingerprint,applied_revision,source_revision) VALUES(p_property,p_request,digest,p_revision+1,next_source);
 RETURN public.web_intake_receipt(p_actor,NULL,p_property)||jsonb_build_object('replayed',false,'appliedRevision',p_revision+1);
END $$;
REVOKE ALL ON FUNCTION public.web_assert_input(jsonb),public.web_intake_receipt(uuid,uuid,uuid),public.web_create_intake(uuid,uuid,jsonb,jsonb),public.web_find_intake_write(uuid,uuid,integer,uuid,jsonb,jsonb,boolean),public.web_save_intake(uuid,uuid,integer,uuid,jsonb,jsonb,jsonb,boolean),public.web_save_source(uuid,uuid,integer,integer,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.web_assert_input(jsonb),public.web_intake_receipt(uuid,uuid,uuid),public.web_create_intake(uuid,uuid,jsonb,jsonb),public.web_find_intake_write(uuid,uuid,integer,uuid,jsonb,jsonb,boolean),public.web_save_intake(uuid,uuid,integer,uuid,jsonb,jsonb,jsonb,boolean),public.web_save_source(uuid,uuid,integer,integer,uuid,jsonb) TO service_role;
COMMIT;
