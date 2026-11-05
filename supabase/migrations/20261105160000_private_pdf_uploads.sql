BEGIN;
-- Preserve existing bucket privacy and other MIME restrictions. NULL means no
-- MIME restriction and must not be replaced with a narrower guessed list.
UPDATE storage.buckets SET allowed_mime_types=array_append(allowed_mime_types,'application/pdf')
WHERE id='showroom-private-media' AND public=false AND allowed_mime_types IS NOT NULL
AND NOT('application/pdf'=ANY(allowed_mime_types));
COMMIT;
