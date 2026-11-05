"""Bounded PDF text inspection and citation checks, never fact verification.

Untrusted PDF parsing runs in a separate process with time/memory/output bounds.
Only the worker keeps page text temporarily; persisted results contain statuses
and digests, not a second copy of the document text.
"""
import hashlib
import io
import json
import logging
from pathlib import Path
import subprocess
import sys
import unicodedata

MAX_PDF_BYTES = 8 * 1024 * 1024
MAX_PAGES = 100
MAX_PAGE_TEXT = 40000
MAX_TOTAL_TEXT = 400000
MAX_PAGE_STREAM = 2 * 1024 * 1024
MAX_RESULT_BYTES = 3 * 1024 * 1024


class PdfInspectionError(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def _inspect(data):
    """Child-process implementation. Do not call on customer files in-process."""
    from pypdf import PdfReader
    logging.getLogger('pypdf').disabled = True
    if not data.startswith(b'%PDF-') or len(data) > MAX_PDF_BYTES:
        return {'error':'document_pdf_invalid'}
    try:
        reader = PdfReader(io.BytesIO(data), strict=True)
        if reader.is_encrypted:
            return {'error':'document_pdf_encrypted'}
        count = len(reader.pages)
        if not count:
            return {'error':'document_pdf_invalid'}
        if count > MAX_PAGES:
            return {'error':'document_pdf_page_limit'}
        pages, total = [], 0
        for page in reader.pages:
            try:
                contents = page.get_contents()
                if contents is not None and len(contents.get_data()) > MAX_PAGE_STREAM:
                    pages.append({'status':'text_limited','text':''})
                    continue
                text = page.extract_text() or ''
                remaining = max(0, MAX_TOTAL_TEXT - total)
                available = min(MAX_PAGE_TEXT, remaining)
                limited = len(text) > available
                text = text[:available]
                total += len(text)
                pages.append({'status':'text_limited' if limited else 'text_available' if text.strip() else 'no_extractable_text','text':text})
            except (MemoryError, RecursionError):
                pages.append({'status':'text_limited','text':''})
            except Exception:
                pages.append({'status':'page_unreadable','text':''})
        return {'sha256':hashlib.sha256(data).hexdigest(),'page_count':count,'pages':pages}
    except (MemoryError, RecursionError):
        return {'error':'document_pdf_resource_limit'}
    except Exception:
        return {'error':'document_pdf_invalid'}


def inspect_pdf(data):
    if not isinstance(data, bytes) or not 0 < len(data) <= MAX_PDF_BYTES:
        raise PdfInspectionError('document_pdf_invalid')
    try:
        result = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--inspect'],
                                input=data, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=15, check=False)
    except OSError:
        raise PdfInspectionError('document_pdf_parser_unavailable') from None
    except subprocess.TimeoutExpired:
        raise PdfInspectionError('document_pdf_timeout') from None
    if result.returncode != 0:
        raise PdfInspectionError('document_pdf_resource_limit')
    if len(result.stdout) > MAX_RESULT_BYTES:
        raise PdfInspectionError('document_pdf_resource_limit')
    try:
        report = json.loads(result.stdout)
    except (ValueError, UnicodeError):
        raise PdfInspectionError('document_pdf_invalid') from None
    if report.get('error'):
        code=report['error']
        raise PdfInspectionError(code if code in {
            'document_pdf_invalid','document_pdf_encrypted','document_pdf_page_limit','document_pdf_resource_limit','document_pdf_parser_unavailable'
        } else 'document_pdf_invalid')
    return report


def candidate_fingerprint(candidate):
    trim=lambda key: str(candidate.get(key) or '').strip()
    fields=[trim('key'),trim('value'),trim('unit'),candidate.get('source_index',0),candidate.get('page',0),trim('quote'),bool(candidate.get('missing')) or not trim('value')]
    return hashlib.sha256(json.dumps(fields, ensure_ascii=False, separators=(',',':')).encode()).hexdigest()


def _normalized(value):
    return ''.join(unicodedata.normalize('NFKC',value).split())


def citation_checks(candidates, reports):
    """A text match proves only occurrence of text, not the claim's truth."""
    checks=[]
    for index,candidate in enumerate(candidates[:20]):
        source=candidate.get('source_index',0)
        report=reports.get(source)
        page=candidate.get('page',0)
        status='not_checked'
        if report:
            if not isinstance(page,int) or not 1 <= page <= report['page_count']:
                status='page_out_of_range'
            else:
                extracted=report['pages'][page-1]
                quote=_normalized(candidate.get('quote',''))
                text=_normalized(extracted['text'])
                if not quote:
                    status='quote_missing'
                elif extracted['status']=='no_extractable_text':
                    status='no_extractable_text'
                elif extracted['status']=='page_unreadable':
                    status='page_unreadable'
                elif quote not in text:
                    status='text_limited' if extracted['status']=='text_limited' else 'quote_not_found'
                elif candidate.get('missing') is not True and _normalized(candidate.get('value','')) not in quote:
                    status='value_not_in_quote'
                elif candidate.get('unit') and _normalized(candidate['unit']) not in quote:
                    status='unit_not_in_quote'
                else:
                    status='quote_matched'
        checks.append({'candidate_index':index,'fingerprint':candidate_fingerprint(candidate),'source_index':source,
                       'page':page,'status':status,**({'source_sha256':report['sha256']} if report else {})})
    return checks


def document_summaries(reports):
    return [{'source_index':index,'sha256':report['sha256'],'page_count':report['page_count'],
             'textless_pages':[i+1 for i,p in enumerate(report['pages']) if p['status']=='no_extractable_text'],
             'limited_pages':[i+1 for i,p in enumerate(report['pages']) if p['status']=='text_limited'],
             'unreadable_pages':[i+1 for i,p in enumerate(report['pages']) if p['status']=='page_unreadable']}
            for index,report in reports.items()]


if __name__=='__main__' and sys.argv[1:]==['--inspect']:
    try:
        try:
            import resource
            resource.setrlimit(resource.RLIMIT_AS,(512*1024*1024,512*1024*1024))
            resource.setrlimit(resource.RLIMIT_CPU,(10,10))
        except ImportError:
            pass
        inspected=_inspect(sys.stdin.buffer.read(MAX_PDF_BYTES+1))
    except ImportError:
        inspected={'error':'document_pdf_parser_unavailable'}
    except Exception:
        inspected={'error':'document_pdf_invalid'}
    sys.stdout.write(json.dumps(inspected,ensure_ascii=False,separators=(',',':')))
