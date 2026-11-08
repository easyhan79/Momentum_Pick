"""Validated provider failover. No credentials or source material in exceptions/logs."""
import base64
import copy
from dataclasses import dataclass
import json
import re
import time

DEFAULT_MODELS = {'gemini': 'gemini-3.8-flash', 'openai': 'gpt-6.1-terra', 'anthropic': 'claude-sonnet-5-5'}
KEY_NAMES = {'gemini': 'GEMINI_API_KEY', 'openai': 'OPENAI_API_KEY', 'anthropic': 'ANTHROPIC_API_KEY'}


class ProviderError(Exception):
    def __init__(self, safe_code, retryable=False, allow_fallback=True):
        self.safe_code, self.retryable, self.allow_fallback = safe_code, retryable, allow_fallback
        super().__init__(safe_code)


@dataclass(frozen=True)
class Generation:
    text: str
    provider: str
    model: str


def strict_schema(schema):
    result = copy.deepcopy(schema)
    def visit(node):
        if isinstance(node, dict):
            if node.get('type') == 'object':
                node['additionalProperties'] = False
                node['required'] = list(node.get('properties', {}))
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for value in node:
                visit(value)
    visit(result)
    return result


def content_blocks(parts, provider):
    content = []
    for part in parts:
        if isinstance(part, str):
            content.append({'type': 'input_text' if provider == 'openai' else 'text', 'text': part})
            continue
        if not isinstance(part, dict) or part.get('mime_type') not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') or not isinstance(part.get('data'), bytes):
            raise ProviderError('attachment_invalid', allow_fallback=False)
        mime, encoded = part['mime_type'], base64.b64encode(part['data']).decode('ascii')
        if provider == 'openai':
            content.append({'type': 'input_file', 'filename': 'property.pdf', 'file_data': f'data:{mime};base64,{encoded}'} if mime == 'application/pdf' else {'type': 'input_image', 'image_url': f'data:{mime};base64,{encoded}'})
        else:
            content.append({'type': 'document' if mime == 'application/pdf' else 'image', 'source': {'type': 'base64', 'media_type': mime, 'data': encoded}})
    return content


def http_generate(provider, model, key, parts, schema, post, timeout):
    if provider == 'openai':
        url, headers = 'https://api.openai.com/v1/responses', {'Authorization': 'Bearer ' + key}
        payload = {'model': model, 'store': False, 'max_output_tokens': 16000,
                   'reasoning': {'effort': 'low'}, 'input': [{'role': 'user', 'content': content_blocks(parts, provider)}],
                   'text': {'format': {'type': 'json_schema', 'name': 'property_marketing', 'strict': True, 'schema': schema}}}
    else:
        url, headers = 'https://api.anthropic.com/v1/messages', {'x-api-key': key, 'anthropic-version': '2023-06-01'}
        payload = {'model': model, 'max_tokens': 16000, 'messages': [{'role': 'user', 'content': content_blocks(parts, provider)}],
                   'output_config': {'format': {'type': 'json_schema', 'schema': schema}}}
    try:
        response = post(url, headers={**headers, 'Content-Type': 'application/json'}, json=payload, timeout=(10, timeout), allow_redirects=False)
    except Exception:
        raise ProviderError(provider + '_transport', True) from None
    if response.status_code != 200:
        status = response.status_code
        raise ProviderError(provider + '_http_' + str(status), status in (408, 429, 500, 502, 503, 504, 529))
    try:
        if len(response.content) > 2 * 1024 * 1024:
            raise ValueError('oversized')
        body = response.json()
    except Exception:
        raise ProviderError(provider + '_invalid_response', True) from None
    if provider == 'openai':
        blocks = [item for output in body.get('output', []) if output.get('type') == 'message' for item in output.get('content', [])]
        if any(item.get('type') == 'refusal' for item in blocks):
            raise ProviderError(provider + '_refusal', allow_fallback=False)
        if body.get('status') != 'completed':
            raise ProviderError(provider + '_incomplete', True)
        text = ''.join(item.get('text', '') for item in blocks if item.get('type') == 'output_text')
    else:
        if body.get('stop_reason') == 'refusal':
            raise ProviderError(provider + '_refusal', allow_fallback=False)
        if body.get('stop_reason') != 'end_turn':
            raise ProviderError(provider + '_incomplete', True)
        text = ''.join(item.get('text', '') for item in body.get('content', []) if item.get('type') == 'text')
    if not text:
        raise ProviderError(provider + '_empty_response', True)
    return text


def generate_with_fallback(parts, schema, validate, env, post, gemini_generate, emit=print, clock=time.monotonic, stop_on_schema_error=False):
    """One call per configured provider, shared 240s budget; stop after first valid result.

    Refusals stop rather than trying another provider to evade their protections.
    Missing providers incur no network request; auth/schema errors are visible safe codes.
    """
    order = list(dict.fromkeys(item.strip() for item in env.get('AI_PROVIDER_ORDER', 'gemini,openai,anthropic').split(',')))
    if not order or any(provider not in KEY_NAMES for provider in order):
        raise ProviderError('provider_order_invalid', allow_fallback=False)
    schema, deadline, transient, attempted = strict_schema(schema), clock() + 240, False, False
    for provider in order:
        key = env.get(KEY_NAMES[provider], '').strip()
        if not key:
            emit(f'ai provider={provider} skipped=not_configured', flush=True)
            continue
        model = env.get(provider.upper() + '_MODEL', DEFAULT_MODELS[provider]).strip()
        prefix = 'claude-' if provider == 'anthropic' else 'gpt-' if provider == 'openai' else 'gemini-'
        if not model.startswith(prefix) or not re.fullmatch(r'[a-zA-Z0-9.\-]{1,80}', model):
            raise ProviderError('provider_model_invalid', allow_fallback=False)
        remaining = deadline - clock()
        if remaining <= 0:
            raise ProviderError('provider_budget_exhausted', True)
        attempted = True
        emit(f'ai provider={provider} started', flush=True)
        try:
            if provider == 'gemini':
                try:
                    text = gemini_generate(parts, model, min(90, remaining))
                except ProviderError:
                    raise
                except Exception as exc:
                    code = getattr(exc, 'code', None)
                    # Gemini policy blocks may be returned as an empty/safety result by adapter.
                    retryable = code in (408, 429, 500, 502, 503, 504) or type(exc).__name__ in ('RemoteProtocolError', 'ReadTimeout', 'ConnectTimeout', 'ConnectError', 'ReadError')
                    raise ProviderError('gemini_http_' + str(code) if isinstance(code, int) else 'gemini_transport', retryable) from None
            else:
                text = http_generate(provider, model, key, parts, schema, post, min(90, remaining))
            try:
                validate(text)
            except Exception:
                if stop_on_schema_error:
                    raise ProviderError(provider + '_schema_invalid', allow_fallback=False) from None
                raise ProviderError(provider + '_schema_invalid', True) from None
        except ProviderError as exc:
            emit(f'ai provider={provider} failed={exc.safe_code}', flush=True)
            if env.get('AI_STOP_ON_UNCERTAIN') == 'true' and (exc.safe_code.endswith('_transport') or exc.safe_code.endswith(('_http_408', '_http_504'))):
                raise ProviderError('outcome_unknown', allow_fallback=False) from None
            if not exc.allow_fallback:
                raise
            transient = transient or exc.retryable
            continue
        emit(f'ai provider={provider} selected model={model}', flush=True)
        return Generation(text, provider, model)
    raise ProviderError('providers_unavailable' if attempted else 'providers_not_configured', transient)
