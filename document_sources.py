"""Read one property-scoped private PDF without logging paths or credentials."""
import re

MAX_PDF_BYTES = 8 * 1024 * 1024
UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'

def load_private_document(url, headers, property_id, asset_id, requests):
    if not re.fullmatch(UUID, property_id, re.I) or not re.fullmatch(UUID, asset_id, re.I):
        raise ValueError('document_reference_invalid')
    response = requests.get(url + '/rest/v1/property_assets?id=eq.' + asset_id + '&property_id=eq.' + property_id
                            + '&bucket_id=eq.showroom-private-media&kind=eq.document&source_type=neq.ai_generated&select=storage_path,kind,source_type',
                            headers=headers, timeout=20, allow_redirects=False)
    if response.status_code != 200:
        raise ValueError('document_source_unavailable')
    rows = response.json()
    if not isinstance(rows, list) or len(rows) != 1:
        raise ValueError('document_source_unavailable')
    source = rows[0]
    path = source.get('storage_path', '')
    if source.get('kind') != 'document' or source.get('source_type') == 'ai_generated' or not re.fullmatch(re.escape(property_id) + '/' + UUID + r'\.pdf', path, re.I):
        raise ValueError('document_reference_invalid')
    with requests.get(url + '/storage/v1/object/showroom-private-media/' + path,
                      headers=headers, timeout=30, allow_redirects=False, stream=True) as download:
        if download.status_code != 200:
            raise ValueError('document_source_unavailable')
        chunks, size = [], 0
        for chunk in download.iter_content(65536):
            size += len(chunk)
            if size > MAX_PDF_BYTES:
                raise ValueError('document_too_large')
            chunks.append(chunk)
    data = b''.join(chunks)
    if not data.startswith(b'%PDF-'):
        raise ValueError('document_format_invalid')
    return {'mime_type':'application/pdf', 'data':data}
