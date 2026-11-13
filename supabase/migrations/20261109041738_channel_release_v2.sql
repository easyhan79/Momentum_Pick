-- Recovered from production (supabase_migrations.schema_migrations, project aklcylhqslgntkgloqpi) on 2026-11-13.
-- Applied in production on 20261109; the original file was never committed to this repository.
BEGIN;
-- An approval captures content at a specific draft revision. Heads can move,
-- but release rows never change, so later edits cannot change an approval.
CREATE TABLE public.property_channel_releases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 property_id uuid NOT NULL REFERENCES public.properties(id),
 channel text NOT NULL CHECK(channel IN ('showroom','blog1','blog2','cards')),
 draft_revision integer NOT NULL CHECK(draft_revision>0),
 approved_by uuid NOT NULL REFERENCES auth.users(id),
 approved_at timestamptz NOT NULL DEFAULT now(),
 request_id uuid NOT NULL,
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND length(snapshot::text)<=250000),
 UNIQUE(property_id,channel,request_id),
 UNIQUE(property_id,channel,id)
);
CREATE TABLE public.property_channel_heads (
 property_id uuid NOT NULL,
 channel text NOT NULL CHECK(channel IN ('showroom','blog1','blog2','cards')),
 release_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('approved','published','withdrawn')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(property_id,channel),
 FOREIGN KEY(property_id,channel,release_id) REFERENCES public.property_channel_releases(property_id,channel,id),
 CHECK((channel='showroom' AND state IN ('published','withdrawn')) OR (channel<>'showroom' AND state IN ('approved','withdrawn')))
);
CREATE TABLE public.property_card_staging (
 request_id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES public.properties(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 draft_revision integer NOT NULL CHECK(draft_revision>0),
 title text NOT NULL,
 caption text NOT NULL CHECK(length(caption) BETWEEN 1 AND 18000),
 consistency_reviewed boolean NOT NULL DEFAULT false,
 state text NOT NULL DEFAULT 'preparing' CHECK(state IN ('preparing','approved')),
 release_id uuid REFERENCES public.property_channel_releases(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(property_id,request_id)
);
CREATE TABLE public.property_card_staging_files (
 request_id uuid NOT NULL REFERENCES public.property_card_staging(request_id),
 card_index integer NOT NULL CHECK(card_index BETWEEN 1 AND 5),
 asset_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 4194304),
 storage_path text NOT NULL,
 PRIMARY KEY(request_id,card_index)
);
CREATE INDEX property_channel_releases_property_idx ON public.property_channel_releases(property_id,channel,approved_at DESC);
ALTER TABLE public.property_channel_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_channel_releases FORCE ROW LEVEL SECURITY;
ALTER TABLE public.property_channel_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_channel_heads FORCE ROW LEVEL SECURITY;
ALTER TABLE public.property_card_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_card_staging FORCE ROW LEVEL SECURITY;
ALTER TABLE public.property_card_staging_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_card_staging_files FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_channel_releases,public.property_channel_heads,public.property_card_staging,public.property_card_staging_files FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.property_channel_releases TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.property_channel_heads TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.property_card_staging TO service_role;
GRANT SELECT,INSERT ON public.property_card_staging_files TO service_role;

-- Preserve the latest already-approved legacy snapshot as a release. Rows
-- without approval provenance are not promoted to approved content.
WITH imported AS (
 INSERT INTO public.property_channel_releases(property_id,channel,draft_revision,approved_by,approved_at,request_id,snapshot)
 SELECT s.property_id,'showroom',GREATEST(1,s.published_revision-1),s.approved_by,s.approved_at,gen_random_uuid(),jsonb_build_object('slug',s.slug,'publishedRevision',s.published_revision,'content',s.published_content)
 FROM public.property_showrooms s WHERE s.published_content IS NOT NULL AND s.published_revision IS NOT NULL AND s.approved_by IS NOT NULL AND s.approved_at IS NOT NULL
 RETURNING property_id,id
)
INSERT INTO public.property_channel_heads(property_id,channel,release_id,state)
SELECT imported.property_id,'showroom',imported.id,CASE WHEN s.showroom_status='published' THEN 'published' ELSE 'withdrawn' END FROM imported JOIN public.property_showrooms s ON s.property_id=imported.property_id;

CREATE FUNCTION public.web_approve_blog_release(p_property uuid,p_actor uuid,p_channel text,p_revision integer,p_request uuid,p_consistency boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE session public.web_submission_sessions;room public.property_showrooms;prior public.property_channel_releases;created public.property_channel_releases;body text;
BEGIN
 IF p_property IS NULL OR p_actor IS NULL OR p_request IS NULL OR p_channel IS NULL OR p_channel NOT IN ('blog1','blog2') OR p_revision IS NULL OR p_revision<1 THEN RAISE EXCEPTION 'invalid_release';END IF;
 SELECT * INTO session FROM public.web_submission_sessions WHERE property_id=p_property AND state='committed' FOR UPDATE;
 IF FOUND AND (session.actor_id<>p_actor OR session.prepared_run_id IS NULL) THEN RAISE EXCEPTION 'draft_not_ready';END IF;
 IF NOT FOUND AND EXISTS(SELECT 1 FROM public.property_web_intakes WHERE property_id=p_property AND created_by<>p_actor) THEN RAISE EXCEPTION 'draft_not_ready';END IF;
 SELECT * INTO prior FROM public.property_channel_releases WHERE property_id=p_property AND channel=p_channel AND request_id=p_request;
 IF FOUND THEN
  IF prior.approved_by<>p_actor OR prior.draft_revision<>p_revision OR COALESCE((prior.snapshot->>'consistencyReviewed')::boolean,false)<>COALESCE(p_consistency,false) THEN RAISE EXCEPTION 'release_request_conflict';END IF;
  RETURN jsonb_build_object('release',to_jsonb(prior),'replayed',true);
 END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft_missing';END IF;
 IF room.revision<>p_revision THEN RAISE EXCEPTION 'revision_conflict';END IF;
 body:=room.draft_content->'marketing'->>CASE p_channel WHEN 'blog1' THEN 'target_1_blog' ELSE 'target_2_blog' END;
 IF body IS NULL OR length(btrim(body))=0 OR length(body)>18000 THEN RAISE EXCEPTION 'release_content_missing';END IF;
 INSERT INTO public.property_channel_releases(property_id,channel,draft_revision,approved_by,request_id,snapshot)
 VALUES(p_property,p_channel,p_revision,p_actor,p_request,jsonb_build_object('title',room.draft_content->>'title','content',body,'consistencyReviewed',COALESCE(p_consistency,false))) RETURNING * INTO created;
 INSERT INTO public.property_channel_heads(property_id,channel,release_id,state) VALUES(p_property,p_channel,created.id,'approved')
 ON CONFLICT(property_id,channel) DO UPDATE SET release_id=EXCLUDED.release_id,state=EXCLUDED.state,updated_at=now();
 RETURN jsonb_build_object('release',to_jsonb(created),'replayed',false);
END $$;

CREATE FUNCTION public.web_begin_card_release(p_property uuid,p_actor uuid,p_revision integer,p_request uuid,p_consistency boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE session public.web_submission_sessions;room public.property_showrooms;stage public.property_card_staging;
BEGIN
 IF p_property IS NULL OR p_actor IS NULL OR p_request IS NULL OR p_revision IS NULL OR p_revision<1 THEN RAISE EXCEPTION 'invalid_release';END IF;
 SELECT * INTO session FROM public.web_submission_sessions WHERE property_id=p_property AND state='committed' FOR UPDATE;
 IF FOUND AND (session.actor_id<>p_actor OR session.prepared_run_id IS NULL) THEN RAISE EXCEPTION 'draft_not_ready';END IF;
 IF NOT FOUND AND EXISTS(SELECT 1 FROM public.property_web_intakes WHERE property_id=p_property AND created_by<>p_actor) THEN RAISE EXCEPTION 'draft_not_ready';END IF;
 SELECT * INTO stage FROM public.property_card_staging WHERE request_id=p_request FOR UPDATE;
 IF FOUND THEN
  IF stage.property_id<>p_property OR stage.actor_id<>p_actor OR stage.draft_revision<>p_revision OR stage.consistency_reviewed<>COALESCE(p_consistency,false) THEN RAISE EXCEPTION 'release_request_conflict';END IF;
  RETURN to_jsonb(stage);
 END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft_missing';END IF;
 IF room.revision<>p_revision THEN RAISE EXCEPTION 'revision_conflict';END IF;
 IF length(btrim(COALESCE(room.draft_content->'marketing'->>'insta_caption','')))=0 THEN RAISE EXCEPTION 'release_content_missing';END IF;
 INSERT INTO public.property_card_staging(request_id,property_id,actor_id,draft_revision,title,caption,consistency_reviewed) VALUES(p_request,p_property,p_actor,p_revision,COALESCE(room.draft_content->>'title','매물'),room.draft_content->'marketing'->>'insta_caption',COALESCE(p_consistency,false)) RETURNING * INTO stage;
 RETURN to_jsonb(stage);
END $$;

CREATE FUNCTION public.web_card_stage_access(p_property uuid,p_actor uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE stage public.property_card_staging;
BEGIN
 SELECT * INTO stage FROM public.property_card_staging WHERE request_id=p_request AND property_id=p_property AND actor_id=p_actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'release_missing';END IF;
 RETURN to_jsonb(stage)||jsonb_build_object('files',COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY card_index) FROM public.property_card_staging_files f WHERE f.request_id=p_request),'[]'::jsonb));
END $$;

CREATE FUNCTION public.web_record_card_file(p_property uuid,p_actor uuid,p_request uuid,p_index integer,p_sha256 text,p_bytes integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE stage public.property_card_staging;file public.property_card_staging_files;path text;
BEGIN
 IF p_index IS NULL OR p_index NOT BETWEEN 1 AND 5 OR p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$' OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 4194304 THEN RAISE EXCEPTION 'invalid_release';END IF;
 SELECT * INTO stage FROM public.property_card_staging WHERE request_id=p_request AND property_id=p_property AND actor_id=p_actor FOR UPDATE;
 IF NOT FOUND OR stage.state<>'preparing' THEN RAISE EXCEPTION 'release_missing';END IF;
 path:=p_property::text||'/'||p_request::text||'/card-'||p_index::text||'.png';
 SELECT * INTO file FROM public.property_card_staging_files WHERE request_id=p_request AND card_index=p_index;
 IF FOUND THEN IF file.sha256<>p_sha256 OR file.byte_size<>p_bytes THEN RAISE EXCEPTION 'release_request_conflict';END IF;RETURN to_jsonb(file);END IF;
 INSERT INTO public.property_card_staging_files(request_id,card_index,sha256,byte_size,storage_path) VALUES(p_request,p_index,p_sha256,p_bytes,path) RETURNING * INTO file;
 RETURN to_jsonb(file);
END $$;

CREATE FUNCTION public.web_commit_card_release(p_property uuid,p_actor uuid,p_request uuid,p_zip_sha256 text,p_zip_bytes integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE stage public.property_card_staging;room public.property_showrooms;created public.property_channel_releases;items jsonb;
BEGIN
 IF p_zip_sha256 IS NULL OR p_zip_sha256 !~ '^[a-f0-9]{64}$' OR p_zip_bytes IS NULL OR p_zip_bytes NOT BETWEEN 1 AND 22020096 THEN RAISE EXCEPTION 'invalid_release';END IF;
 SELECT * INTO stage FROM public.property_card_staging WHERE request_id=p_request AND property_id=p_property AND actor_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'release_missing';END IF;
 IF stage.state='approved' THEN SELECT * INTO created FROM public.property_channel_releases WHERE id=stage.release_id;RETURN jsonb_build_object('release',to_jsonb(created),'replayed',true);END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND OR room.revision<>stage.draft_revision THEN RAISE EXCEPTION 'revision_conflict';END IF;
 IF (SELECT count(*) FROM public.property_card_staging_files WHERE request_id=p_request)<>5 THEN RAISE EXCEPTION 'release_not_ready';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',asset_id,'kind','card_png','index',card_index,'sha256',sha256,'bytes',byte_size,'storagePath',storage_path) ORDER BY card_index) INTO items FROM public.property_card_staging_files WHERE request_id=p_request;
 items:=items||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','card_zip','sha256',p_zip_sha256,'bytes',p_zip_bytes,'storagePath',p_property::text||'/'||p_request::text||'/cards.zip'));
 INSERT INTO public.property_channel_releases(property_id,channel,draft_revision,approved_by,request_id,snapshot) VALUES(p_property,'cards',stage.draft_revision,p_actor,p_request,jsonb_build_object('title',stage.title,'caption',stage.caption,'artifacts',items,'consistencyReviewed',stage.consistency_reviewed)) RETURNING * INTO created;
 INSERT INTO public.property_channel_heads(property_id,channel,release_id,state) VALUES(p_property,'cards',created.id,'approved') ON CONFLICT(property_id,channel) DO UPDATE SET release_id=EXCLUDED.release_id,state='approved',updated_at=now();
 UPDATE public.property_card_staging SET state='approved',release_id=created.id WHERE request_id=p_request;
 RETURN jsonb_build_object('release',to_jsonb(created),'replayed',false);
END $$;

CREATE FUNCTION public.web_card_artifact(p_property uuid,p_actor uuid,p_release uuid,p_index integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE session public.web_submission_sessions;release public.property_channel_releases;item jsonb;
BEGIN
 SELECT * INTO session FROM public.web_submission_sessions WHERE property_id=p_property AND state='committed';
 IF FOUND AND (session.actor_id<>p_actor OR session.prepared_run_id IS NULL) THEN RAISE EXCEPTION 'release_missing';END IF;
 IF NOT FOUND AND EXISTS(SELECT 1 FROM public.property_web_intakes WHERE property_id=p_property AND created_by<>p_actor) THEN RAISE EXCEPTION 'release_missing';END IF;
 SELECT * INTO release FROM public.property_channel_releases WHERE id=p_release AND property_id=p_property AND channel='cards';
 IF NOT FOUND OR p_index IS NULL OR p_index NOT BETWEEN 0 AND 5 THEN RAISE EXCEPTION 'release_missing';END IF;
 SELECT value INTO item FROM jsonb_array_elements(release.snapshot->'artifacts') WHERE (p_index=0 AND value->>'kind'='card_zip') OR (value->>'kind'='card_png' AND (value->>'index')::integer=p_index);
 IF item IS NULL THEN RAISE EXCEPTION 'release_missing';END IF;
 RETURN item;
END $$;

CREATE FUNCTION public.web_publish_v2_release(p_property uuid,p_actor uuid,p_revision integer,p_request uuid,p_snapshot jsonb,p_review jsonb,p_consistency boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE session public.web_submission_sessions;room public.property_showrooms;prior public.property_channel_releases;created public.property_channel_releases;
BEGIN
 IF p_property IS NULL OR p_actor IS NULL OR p_request IS NULL OR p_revision IS NULL OR p_revision<1 OR p_revision>=2147483647 OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' OR length(p_snapshot::text)>250000 OR jsonb_typeof(p_review) IS DISTINCT FROM 'object' OR p_consistency IS NULL THEN RAISE EXCEPTION 'invalid_release';END IF;
 SELECT * INTO session FROM public.web_submission_sessions WHERE property_id=p_property AND state='committed' FOR UPDATE;
 IF FOUND AND (session.actor_id<>p_actor OR session.prepared_run_id IS NULL) THEN RAISE EXCEPTION 'draft_not_ready';END IF;
 IF NOT FOUND AND EXISTS(SELECT 1 FROM public.property_web_intakes WHERE property_id=p_property AND created_by<>p_actor) THEN RAISE EXCEPTION 'draft_not_ready';END IF;
 SELECT * INTO prior FROM public.property_channel_releases WHERE property_id=p_property AND channel='showroom' AND request_id=p_request;
 IF FOUND THEN
  IF prior.approved_by<>p_actor OR prior.draft_revision<>p_revision OR prior.snapshot->>'requestFingerprint' IS DISTINCT FROM md5(jsonb_build_array(p_revision,p_review,p_consistency)::text) THEN RAISE EXCEPTION 'release_request_conflict';END IF;
  SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property;
  RETURN jsonb_build_object('showroom',to_jsonb(room),'release',to_jsonb(prior),'replayed',true);
 END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft_missing';END IF;
 IF room.revision<>p_revision THEN RAISE EXCEPTION 'revision_conflict';END IF;
 IF room.showroom_status<>'in_review' THEN RAISE EXCEPTION 'review_required';END IF;
 UPDATE public.property_showrooms SET showroom_status='published',published_content=p_snapshot,published_revision=p_revision+1,revision=p_revision+1,approved_by=p_actor,approved_at=now(),published_at=now() WHERE property_id=p_property RETURNING * INTO room;
 INSERT INTO public.property_channel_releases(property_id,channel,draft_revision,approved_by,request_id,snapshot) VALUES(p_property,'showroom',p_revision,p_actor,p_request,jsonb_build_object('slug',room.slug,'publishedRevision',room.published_revision,'content',p_snapshot,'requestFingerprint',md5(jsonb_build_array(p_revision,p_review,p_consistency)::text))) RETURNING * INTO created;
 INSERT INTO public.property_channel_heads(property_id,channel,release_id,state) VALUES(p_property,'showroom',created.id,'published') ON CONFLICT(property_id,channel) DO UPDATE SET release_id=EXCLUDED.release_id,state='published',updated_at=now();
 RETURN jsonb_build_object('showroom',to_jsonb(room),'release',to_jsonb(created),'replayed',false);
END $$;

CREATE FUNCTION public.web_showroom_release_receipt(p_property uuid,p_actor uuid,p_revision integer,p_request uuid,p_review jsonb,p_consistency boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE session public.web_submission_sessions;release public.property_channel_releases;room public.property_showrooms;
BEGIN
 SELECT * INTO session FROM public.web_submission_sessions WHERE property_id=p_property AND state='committed';
 IF FOUND AND (session.actor_id<>p_actor OR session.prepared_run_id IS NULL) THEN RAISE EXCEPTION 'draft_not_ready';END IF;
 IF NOT FOUND AND EXISTS(SELECT 1 FROM public.property_web_intakes WHERE property_id=p_property AND created_by<>p_actor) THEN RAISE EXCEPTION 'draft_not_ready';END IF;
 SELECT * INTO release FROM public.property_channel_releases WHERE property_id=p_property AND channel='showroom' AND request_id=p_request;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF release.approved_by<>p_actor OR release.draft_revision<>p_revision OR release.snapshot->>'requestFingerprint' IS DISTINCT FROM md5(jsonb_build_array(p_revision,p_review,p_consistency)::text) THEN RAISE EXCEPTION 'release_request_conflict';END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property;
 RETURN jsonb_build_object('showroom',to_jsonb(room),'release',to_jsonb(release),'replayed',true);
END $$;

CREATE FUNCTION public.web_withdraw_v2_release(p_property uuid,p_actor uuid,p_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE session public.web_submission_sessions;room public.property_showrooms;
BEGIN
 SELECT * INTO session FROM public.web_submission_sessions WHERE property_id=p_property AND state='committed' FOR UPDATE;
 IF FOUND AND (session.actor_id<>p_actor OR session.prepared_run_id IS NULL) THEN RAISE EXCEPTION 'draft_not_ready';END IF;
 IF NOT FOUND AND EXISTS(SELECT 1 FROM public.property_web_intakes WHERE property_id=p_property AND created_by<>p_actor) THEN RAISE EXCEPTION 'draft_not_ready';END IF;
 SELECT * INTO room FROM public.property_showrooms WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft_missing';END IF;
 IF p_revision IS NULL OR room.revision<>p_revision OR p_revision>=2147483647 THEN RAISE EXCEPTION 'revision_conflict';END IF;
 UPDATE public.property_showrooms SET showroom_status='unpublished',revision=revision+1 WHERE property_id=p_property RETURNING * INTO room;
 UPDATE public.property_channel_heads SET state='withdrawn',updated_at=now() WHERE property_id=p_property AND channel='showroom';
 RETURN to_jsonb(room);
END $$;

CREATE FUNCTION public.web_completed_releases(p_actor uuid,p_property uuid DEFAULT NULL,p_limit integer DEFAULT 25,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE output jsonb;
BEGIN
 IF p_actor IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000 THEN RAISE EXCEPTION 'invalid_listing_query';END IF;
 WITH accessible AS MATERIALIZED (
  SELECT h.property_id,h.channel,h.state,r.id,r.draft_revision,r.approved_at,r.snapshot,s.revision current_revision,s.draft_content
  FROM public.property_channel_heads h JOIN public.property_channel_releases r ON r.id=h.release_id JOIN public.properties p ON p.id=h.property_id AND p.status IS DISTINCT FROM 'merged'
  JOIN public.property_showrooms s ON s.property_id=h.property_id
  LEFT JOIN public.web_submission_sessions sub ON sub.property_id=h.property_id AND sub.state='committed'
  LEFT JOIN public.property_web_intakes intake ON intake.property_id=h.property_id
  WHERE (sub.property_id IS NULL OR sub.actor_id=p_actor) AND (intake.property_id IS NULL OR intake.created_by=p_actor) AND (p_property IS NULL OR h.property_id=p_property)
 ), grouped AS (
  SELECT property_id,max(approved_at) approved_at,
   (array_agg(COALESCE(snapshot->>'title',snapshot->'content'->>'title','매물') ORDER BY approved_at DESC))[1] title,
   jsonb_agg(jsonb_build_object('channel',channel,'state',state,'releaseId',id,'revision',draft_revision,'approvedAt',approved_at,'hasUnpublishedChanges',CASE channel
    WHEN 'blog1' THEN draft_content->'marketing'->>'target_1_blog' IS DISTINCT FROM snapshot->>'content' OR draft_content->>'title' IS DISTINCT FROM snapshot->>'title'
    WHEN 'blog2' THEN draft_content->'marketing'->>'target_2_blog' IS DISTINCT FROM snapshot->>'content' OR draft_content->>'title' IS DISTINCT FROM snapshot->>'title'
    WHEN 'cards' THEN draft_content->'marketing'->>'insta_caption' IS DISTINCT FROM snapshot->>'caption' OR draft_content->>'title' IS DISTINCT FROM snapshot->>'title'
    ELSE EXISTS(SELECT 1 FROM public.property_editor_versions v WHERE v.property_id=accessible.property_id AND v.revision>COALESCE((snapshot->>'publishedRevision')::integer,draft_revision+1)) END,
    'content',CASE WHEN channel IN ('blog1','blog2') THEN snapshot->>'content' ELSE NULL END,'slug',CASE WHEN channel='showroom' THEN snapshot->>'slug' ELSE NULL END,
    'artifacts',CASE WHEN channel='cards' THEN (SELECT jsonb_agg(value-'storagePath') FROM jsonb_array_elements(snapshot->'artifacts')) ELSE NULL END) ORDER BY channel) channels
  FROM accessible GROUP BY property_id
 ), paged AS (SELECT * FROM grouped ORDER BY approved_at DESC,property_id LIMIT p_limit OFFSET p_offset)
 SELECT jsonb_build_object('properties',COALESCE((SELECT jsonb_agg(to_jsonb(paged) ORDER BY approved_at DESC,property_id) FROM paged),'[]'::jsonb),'total',(SELECT count(*) FROM grouped)) INTO output;
 RETURN output;
END $$;

ALTER FUNCTION public.web_property_overview(uuid,text,text,integer,integer,text) RENAME TO web_property_overview_before_releases;
CREATE FUNCTION public.web_property_overview(p_actor uuid,p_search text,p_status text,p_limit integer,p_offset integer,p_environment text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE output jsonb;approved_count integer;
BEGIN
 output:=public.web_property_overview_before_releases(p_actor,p_search,p_status,p_limit,p_offset,p_environment);
 SELECT count(DISTINCT h.property_id) INTO approved_count FROM public.property_channel_heads h JOIN public.properties p ON p.id=h.property_id AND p.status IS DISTINCT FROM 'merged'
 LEFT JOIN public.web_submission_sessions s ON s.property_id=h.property_id AND s.state='committed'
 LEFT JOIN public.property_web_intakes i ON i.property_id=h.property_id
 WHERE (s.property_id IS NULL OR s.actor_id=p_actor) AND (i.property_id IS NULL OR i.created_by=p_actor);
 RETURN jsonb_set(output,'{summary,approved}',to_jsonb(approved_count),true);
END $$;

REVOKE ALL ON FUNCTION public.web_approve_blog_release(uuid,uuid,text,integer,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.web_approve_blog_release(uuid,uuid,text,integer,uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.web_begin_card_release(uuid,uuid,integer,uuid,boolean),public.web_card_stage_access(uuid,uuid,uuid),public.web_record_card_file(uuid,uuid,uuid,integer,text,integer),public.web_commit_card_release(uuid,uuid,uuid,text,integer),public.web_card_artifact(uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.web_begin_card_release(uuid,uuid,integer,uuid,boolean),public.web_card_stage_access(uuid,uuid,uuid),public.web_record_card_file(uuid,uuid,uuid,integer,text,integer),public.web_commit_card_release(uuid,uuid,uuid,text,integer),public.web_card_artifact(uuid,uuid,uuid,integer) TO service_role;
REVOKE ALL ON FUNCTION public.web_publish_v2_release(uuid,uuid,integer,uuid,jsonb,jsonb,boolean),public.web_showroom_release_receipt(uuid,uuid,integer,uuid,jsonb,boolean),public.web_withdraw_v2_release(uuid,uuid,integer),public.web_completed_releases(uuid,uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.web_publish_v2_release(uuid,uuid,integer,uuid,jsonb,jsonb,boolean),public.web_showroom_release_receipt(uuid,uuid,integer,uuid,jsonb,boolean),public.web_withdraw_v2_release(uuid,uuid,integer),public.web_completed_releases(uuid,uuid,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.web_property_overview(uuid,text,text,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.web_property_overview(uuid,text,text,integer,integer,text) TO service_role;
COMMIT;
