"""
training.py — Training job runner.

Polls training_jobs for pending work, fine-tunes YOLO on uploaded datasets,
uploads new weights, and registers the result as a new ai_models row.
"""

import time
import shutil
import zipfile
from pathlib import Path
from datetime import datetime

import torch
from ultralytics import YOLO

from config import supabase, ai_logger
from model_hub import get_model_path as hub_get_model_path


def _log_job(job_id: str, msg: str, logs_so_far: list):
    """Append a log line to the training_jobs row in real-time."""
    logs_so_far.append(msg)
    ai_logger.info(f"[TrainJob {job_id[:8]}] {msg}")
    try:
        supabase.table('training_jobs').update({
            'logs': logs_so_far,
            'updated_at': datetime.now().isoformat(),
        }).eq('id', job_id).execute()
    except Exception as _e:
        ai_logger.warning(f"[TrainJob] log update failed: {_e}")


def _run_single_training_job(job: dict):
    """Execute one training job end-to-end."""
    job_id    = job['id']
    ds_id     = job.get('dataset_id')
    srv_id    = job.get('server_id')
    epochs    = int(job.get('epochs', 50))
    config    = job.get('configuration') or {}
    base_mid  = config.get('base_model_id')
    batch     = int(config.get('batch_size', 16))
    lr0       = float(config.get('learning_rate', 0.001))
    logs: list = []

    work_dir = Path(f'training_tmp/{job_id}')
    work_dir.mkdir(parents=True, exist_ok=True)

    def log(msg):
        _log_job(job_id, msg, logs)

    def fail(msg):
        log(f'FAILED: {msg}')
        supabase.table('training_jobs').update({
            'status': 'failed',
            'logs': logs,
            'updated_at': datetime.now().isoformat(),
        }).eq('id', job_id).execute()

    try:
        # Mark as processing
        supabase.table('training_jobs').update({
            'status': 'processing',
            'current_epoch': 0,
            'progress': 0,
            'logs': ['Job started'],
            'updated_at': datetime.now().isoformat(),
        }).eq('id', job_id).execute()
        log(f'Job started — epochs={epochs}, batch={batch}, lr={lr0}')

        # 1. Fetch dataset record
        if not ds_id:
            return fail('No dataset_id on job')
        ds_resp = supabase.table('datasets').select('*').eq('id', ds_id).single().execute()
        if not ds_resp.data:
            return fail(f'Dataset {ds_id} not found')
        dataset = ds_resp.data
        storage_path = dataset.get('storage_path', '')
        log(f'Dataset: {dataset["name"]} ({storage_path})')

        # 2. Download dataset ZIP
        zip_path = work_dir / 'dataset.zip'
        log('Downloading dataset from storage...')
        try:
            file_bytes = supabase.storage.from_('datasets').download(storage_path)
            zip_path.write_bytes(file_bytes)
            log(f'Downloaded {len(file_bytes) / 1024 / 1024:.1f} MB')
        except Exception as e:
            return fail(f'Dataset download failed: {e}')

        # 3. Unzip dataset
        extract_dir = work_dir / 'dataset'
        extract_dir.mkdir(exist_ok=True)
        log('Extracting dataset ZIP...')
        try:
            with zipfile.ZipFile(zip_path, 'r') as zf:
                zf.extractall(extract_dir)
        except Exception as e:
            return fail(f'ZIP extraction failed: {e}')

        # 4. Locate data.yaml
        yaml_candidates = list(extract_dir.rglob('*.yaml')) + list(extract_dir.rglob('*.yml'))
        if not yaml_candidates:
            return fail('No .yaml file found in dataset ZIP. Ensure YOLO format with data.yaml.')
        data_yaml = str(yaml_candidates[0])
        log(f'Using dataset config: {data_yaml}')

        # 5. Resolve base model weights
        base_weights = 'yolov8n.pt'
        if base_mid:
            bm_resp = supabase.table('ai_models').select('model_type,model_path').eq('id', base_mid).single().execute()
            if bm_resp.data:
                bm = bm_resp.data
                resolved = hub_get_model_path(bm.get('model_type', ''), bm.get('model_path', '') or '')
                if resolved:
                    base_weights = resolved
                    log(f'Fine-tuning from: {base_weights}')
                else:
                    log(f'Base model path not resolved — using {base_weights}')
            else:
                log(f'Base model {base_mid} not found — using {base_weights}')
        else:
            log(f'No base model specified — using {base_weights}')

        # 6. Load YOLO and run training
        log(f'Loading YOLO weights: {base_weights}')
        try:
            train_model = YOLO(base_weights)
        except Exception as e:
            return fail(f'Failed to load YOLO weights: {e}')

        output_name = f'job_{job_id[:8]}'
        log('Starting training — this may take several minutes...')

        def on_epoch_end(trainer):
            ep = trainer.epoch + 1
            pct = int(ep / epochs * 100)
            log(f'Epoch {ep}/{epochs} — loss={trainer.loss:.4f}')
            try:
                supabase.table('training_jobs').update({
                    'current_epoch': ep,
                    'progress': pct,
                    'updated_at': datetime.now().isoformat(),
                }).eq('id', job_id).execute()
            except Exception:
                pass

        train_model.add_callback('on_train_epoch_end', on_epoch_end)

        device = 0 if torch.cuda.is_available() else 'cpu'
        log(f'Training device: {"GPU" if device == 0 else "CPU"}')

        try:
            results = train_model.train(
                data=data_yaml,
                epochs=epochs,
                batch=batch,
                lr0=lr0,
                name=output_name,
                exist_ok=True,
                device=device,
                verbose=False,
            )
        except Exception as e:
            return fail(f'Training failed: {e}')

        # 7. Locate best weights
        runs_dir = Path('runs/detect') / output_name / 'weights'
        best_pt  = runs_dir / 'best.pt'
        if not best_pt.exists():
            best_pt = runs_dir / 'last.pt'
        if not best_pt.exists():
            return fail(f'Trained weights not found in {runs_dir}')
        log(f'Best weights: {best_pt} ({best_pt.stat().st_size / 1024 / 1024:.1f} MB)')

        # 8. Upload new weights
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        upload_name = f'trained_{output_name}_{ts}.pt'
        log(f'Uploading {upload_name} to Supabase storage...')
        try:
            file_data = best_pt.read_bytes()
            supabase.storage.from_('ai-models').upload(upload_name, file_data)
            log(f'Upload complete ({len(file_data)/1024/1024:.1f} MB)')
        except Exception as e:
            return fail(f'Upload failed: {e}')

        # 9. Register new model
        model_type_new = 'other'
        model_name_new = f'Trained Model ({ts})'
        if base_mid:
            try:
                bm_resp2 = supabase.table('ai_models').select('model_type,name').eq('id', base_mid).single().execute()
                if bm_resp2.data:
                    model_type_new = bm_resp2.data.get('model_type', 'other')
                    model_name_new = f"{bm_resp2.data.get('name', 'Model')} — Retrained {ts}"
            except Exception:
                pass

        new_model_resp = supabase.table('ai_models').insert({
            'name':        model_name_new,
            'description': f'Auto-generated by training job {job_id} — dataset: {dataset["name"]} — {epochs} epochs',
            'model_type':  model_type_new,
            'version':     f'retrain-{ts}',
            'accuracy':    0,
            'server_id':   srv_id,
            'model_path':  upload_name,
            'is_active':   True,
            'smart_reporting': True,
        }).execute()

        new_model_id = None
        if new_model_resp.data:
            new_model_id = new_model_resp.data[0]['id']
            log(f'New model registered: {model_name_new} (id={new_model_id})')

        # 10. Mark job completed
        log('Training completed successfully!')
        supabase.table('training_jobs').update({
            'status':             'completed',
            'current_epoch':      epochs,
            'progress':           100,
            'resulting_model_id': new_model_id,
            'logs':               logs,
            'updated_at':         datetime.now().isoformat(),
        }).eq('id', job_id).execute()

    except Exception as e:
        fail(f'Unexpected error: {e}')
    finally:
        try:
            shutil.rmtree(work_dir, ignore_errors=True)
        except Exception:
            pass


def run_training_jobs():
    """Daemon thread: poll training_jobs for pending work every 15 seconds."""
    ai_logger.info('[TrainingRunner] Started — polling every 15s')
    while True:
        try:
            resp = supabase.table('training_jobs') \
                .select('*') \
                .eq('status', 'pending') \
                .order('created_at') \
                .limit(1) \
                .execute()
            if resp.data:
                job = resp.data[0]
                ai_logger.info(f'[TrainingRunner] Picked up job {job["id"][:8]} — dataset={job.get("dataset_id", "?")}')
                _run_single_training_job(job)
        except Exception as e:
            ai_logger.warning(f'[TrainingRunner] Poll error: {e}')
        time.sleep(15)
