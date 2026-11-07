"""Persistent web executor. No Telegram/GitHub imports, polling or dispatch.

Disabled until a server operator supplies explicit environment/project bindings.
The database owns queue ordering, leases, cancellation and bounded attempts.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import signal
import threading
import uuid
from analysis_worker import analyze_job, failure, generation_services

PRODUCTION_REF = 'aklcylhqslgntkgloqpi'
VERSION = 'web-worker-v1'


def configuration(env):
    if env.get('WEB_WORKER_ENABLED') != 'true':
        return None
    environment, ref = env.get('WORKER_ENVIRONMENT'), env.get('WORKER_PROJECT_REF', '')
    if environment not in ('test', 'staging', 'production') or not re.fullmatch(r'[a-z]{20}', ref):
        raise ValueError('worker_environment_required')
    if (environment == 'production') != (ref == PRODUCTION_REF):
        raise ValueError('worker_environment_mismatch')
    if env.get('SUPABASE_URL', '').rstrip('/') != 'https://' + ref + '.supabase.co':
        raise ValueError('project_mismatch')
    key = env.get('SUPABASE_KEY', '')
    if not key.startswith('sb_secret_'):
        try:
            payload = json.loads(base64.urlsafe_b64decode(key.split('.')[1] + '==='))
            if payload.get('role') != 'service_role' or payload.get('ref') != ref:
                raise ValueError()
        except Exception:
            raise ValueError('server_credential_required') from None
    if not key or not env.get('GEMINI_API_KEY'):
        raise ValueError('worker_credentials_required')
    return {'environment': environment, 'url': 'https://' + ref + '.supabase.co', 'key': key}


class Database:
    def __init__(self, config, requests):
        self.url, self.requests = config['url'], requests
        self.headers = {'apikey': config['key'], 'Content-Type': 'application/json'}
        if not config['key'].startswith('sb_secret_'):
            self.headers['Authorization'] = 'Bearer ' + config['key']

    def rpc(self, name, body):
        response = self.requests.post(self.url + '/rest/v1/rpc/' + name, headers=self.headers, json=body, timeout=20, allow_redirects=False)
        if response.status_code != 200:
            raise RuntimeError('worker_database_unavailable')
        return response.json()

    def document(self, asset, property_id, refs):
        from document_sources import load_private_document
        ref = next((r for r in refs if r.get('assetId') == asset), None)
        if not ref:
            raise ValueError('document_snapshot_mismatch')
        # Check immutable metadata before downloading; never follow a replaced ID.
        response = self.requests.get(self.url + '/rest/v1/property_assets?id=eq.' + asset + '&property_id=eq.' + property_id + '&select=created_at,sha256,byte_size', headers=self.headers, timeout=20, allow_redirects=False)
        if response.status_code != 200 or len(response.json()) != 1:
            raise ValueError('document_snapshot_mismatch')
        row = response.json()[0]
        if row.get('created_at') != ref.get('createdAt') or row.get('sha256') != ref.get('sha256') or row.get('byte_size') != ref.get('bytes'):
            raise ValueError('document_snapshot_mismatch')
        part = load_private_document(self.url, self.headers, property_id, asset, self.requests)
        if ref.get('sha256') and hashlib.sha256(part['data']).hexdigest() != ref['sha256'] or ref.get('bytes') and len(part['data']) != ref['bytes']:
            raise ValueError('document_snapshot_mismatch')
        return part


class LeaseLost(RuntimeError):
    pass


def execute_analysis(db, worker_id, generate, validate, edit=None, emit=print, stop=None, heartbeat_seconds=20):
    job = db.rpc('web_analysis_claim', {'p_worker': worker_id})
    if not job:
        return False
    ended, lost = threading.Event(), threading.Event()

    def progress(phase, candidate=None):
        if lost.is_set():
            raise LeaseLost('worker_lease_lost')
        accepted = db.rpc('web_analysis_progress', {'p_property': job['id'], 'p_token': job['token'], 'p_phase': phase, 'p_candidate': candidate})
        if not accepted:
            lost.set()
            raise LeaseLost('worker_lease_lost')

    def renew():
        while not ended.wait(heartbeat_seconds):
            try:
                progress('heartbeat')
            except Exception:
                lost.set()
                return

    thread = threading.Thread(target=renew, daemon=True)
    thread.start()
    try:
        if job.get('candidate') is not None:
            result = job['candidate'] # Already validated and durably stored; no provider call.
        else:
            def generating():
                if stop and stop.is_set():
                    raise LeaseLost('worker_stopping')
                progress('generating')
            try:
                result = analyze_job(job, generate, lambda _: (_ for _ in ()).throw(ValueError('telegram_attachment_disallowed')), validate, edit,
                                     lambda asset, prop: db.document(asset, prop, job.get('documents', [])), generating)
            except LeaseLost:
                raise
            except Exception as exc:
                code, retryable = failure(exc)
                # Timeouts/transport may have consumed a paid request. Do not retry
                # automatically unless the provider explicitly rejected the call.
                if code.endswith('_transport') or 'timeout' in code or code == 'outcome_unknown':
                    code, retryable = 'outcome_unknown', False
                accepted = db.rpc('web_analysis_complete', {'p_property': job['id'], 'p_token': job['token'], 'p_result': None, 'p_error': code, 'p_retryable': retryable})
                if not accepted:
                    raise LeaseLost('worker_lease_lost')
                emit('web analysis deferred or failed code=' + code, flush=True)
                return True
            # Outside provider try: save failures never trigger another paid call.
            progress('saving', result)
        if lost.is_set():
            raise LeaseLost('worker_lease_lost')
        accepted = db.rpc('web_analysis_complete', {'p_property': job['id'], 'p_token': job['token'], 'p_result': result})
        if not accepted:
            raise LeaseLost('worker_lease_lost')
        emit('web analysis result saved for private review', flush=True)
        return True
    finally:
        ended.set()
        thread.join(timeout=1)


def serve(db, worker_id, environment, generate, validate, edit=None, once=False, stop=None, emit=print, interval=5, auxiliary=None, capabilities=None):
    stop = stop or threading.Event()
    heartbeat_end = threading.Event()
    def heartbeat():
        db.rpc('web_worker_heartbeat', {'p_worker': worker_id, 'p_version': VERSION, 'p_environment': environment, 'p_capabilities': capabilities or ['analysis'], 'p_run': None})
    heartbeat()
    def heartbeat_loop():
        while not heartbeat_end.wait(20):
            try:
                heartbeat()
            except Exception:
                emit('web worker heartbeat unavailable', flush=True)
    monitor = threading.Thread(target=heartbeat_loop, daemon=True)
    monitor.start()
    try:
        while not stop.is_set():
            worked, errors = False, []
            tasks = [lambda: execute_analysis(db, worker_id, generate, validate, edit, emit, stop)]
            if auxiliary:
                tasks.append(auxiliary)
            for task in tasks:
                if stop.is_set():
                    break
                try:
                    worked = task() or worked
                except Exception as exc:
                    errors.append(type(exc).__name__)
                    emit('web worker task failed type=' + type(exc).__name__, flush=True)
            if once:
                if errors:
                    raise RuntimeError('worker_task_failed')
                return
            if errors or not worked:
                stop.wait(min(30, interval * 3) if errors else interval)
    finally:
        heartbeat_end.set()
        monitor.join(timeout=1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    config = configuration(os.environ)
    if config is None:
        print('web worker disabled', flush=True)
        return
    import requests
    db = Database(config, requests)
    generate, validate, edit = generation_services({**os.environ, 'AI_STOP_ON_UNCERTAIN': 'true'}, requests)
    from copy_rewrite_worker import run as rewrite_run, generation_service
    rewrite_generate = generation_service({**os.environ, 'AI_STOP_ON_UNCERTAIN': 'true'}, requests)
    capabilities = ['analysis', 'rewrite', 'plan']
    if os.environ.get('WEB_API_IMAGES_ENABLED') == 'true':
        capabilities.append('image')
    def auxiliary():
        def rewrite_api(name, body):
            return db.rpc('web_copy_rewrite_claim' if name == 'copy_rewrite_claim' else name, body)
        def persist(job, result, provenance):
            return db.rpc('web_copy_rewrite_candidate', {'p_id':job['id'],'p_token':job['token'],'p_result':result,'p_generation':provenance})
        from plan_analysis import analyze_uploaded_plans
        tasks = [lambda:sum(rewrite_run(rewrite_api, rewrite_generate, limit=1, persist=persist).values()),
                 lambda:analyze_uploaded_plans(db.url, db.headers, os.environ['GEMINI_API_KEY'], requests, executor='web_worker')]
        if 'image' in capabilities:
            from image_worker import process_image_jobs
            tasks.append(lambda:process_image_jobs(db.url, db.headers, os.environ['GEMINI_API_KEY'], requests, limit=1, executor='web_worker'))
        worked = False
        for task in tasks:
            try:
                worked = bool(task()) or worked
            except Exception as exc:
                print('web auxiliary task failed type=' + type(exc).__name__, flush=True)
        return worked
    stop = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    serve(db, str(uuid.uuid4()), config['environment'], generate, validate, edit, args.once, stop, auxiliary=auxiliary, capabilities=capabilities)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('web worker stopped type=' + type(exc).__name__, flush=True)
        raise SystemExit(1) from None
