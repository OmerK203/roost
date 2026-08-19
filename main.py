import psycopg
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi import HTTPException, WebSocket, WebSocketDisconnect
import json
import random
import sys


ATTEMPT_CEILING = 10   
CONN = "host=localhost port=5432 dbname=roost user=postgres password=roost"

def claim_job(node_id):
    with psycopg.connect(CONN) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE jobs
                SET status = 'in_progress', node_id = %s, started_at = now(), attempts = attempts + 1
                FROM monitors
                WHERE jobs.id = (
                    SELECT id FROM jobs
                    WHERE status = 'queued' AND scheduled_at <= now()
                    ORDER BY scheduled_at, id
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                )
                AND monitors.id = jobs.monitor_id
                RETURNING jobs.id, jobs.monitor_id, monitors.url;
                """,
                (node_id,)
            )
            row = cur.fetchone()
            if row is None:
                return None
            return {"job_id": row[0], "monitor_id": row[1], "url": row[2]}

def complete_job(job_id, node_id, in_stock):
    with psycopg.connect(CONN) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE jobs
                    SET status = 'done', completed_at = now()
                    WHERE id = %s AND status = 'in_progress' AND node_id = %s
                    RETURNING id, monitor_id;
                    """,
                    (job_id, node_id)     
                )
                row = cur.fetchone()
                if row is None:
                    return None          # guard failed → 409, don't record anything
                job_id_out, monitor_id = row     # unpack what we RETURNING'd
                record_observation(monitor_id, in_stock)
                return job_id_out
                



def reap_jobs():
    with psycopg.connect(CONN) as conn:
        with conn.cursor() as cur:
            # 1. KILL: stalled jobs that have used up their attempts -> dead
            cur.execute(
                """
                UPDATE jobs
                SET status = 'dead'
                WHERE status = 'in_progress'
                  AND started_at < now() - interval '10 minutes'
                  AND attempts >= %s
                RETURNING id;
                """,
                (ATTEMPT_CEILING,)
            )
            dead = [r[0] for r in cur.fetchall()]

            # 2. REQUEUE: stalled jobs still under the limit -> back to queued
            cur.execute(
                """
                UPDATE jobs
                SET status = 'queued', node_id = NULL, started_at = NULL
                WHERE status = 'in_progress'
                  AND started_at < now() - interval '10 minutes'
                  AND attempts < %s
                RETURNING id;
                """,
                (ATTEMPT_CEILING,)
            )
            reaped = [r[0] for r in cur.fetchall()]

            return reaped, dead   # now returns TWO lists

def record_observation(monitor_id, in_stock):
    with psycopg.connect(CONN) as conn:
        with conn.cursor() as cur:
            if in_stock:
                # RESTOCK check: flip false->true, only if currently false
                cur.execute(
                    """
                    UPDATE monitors SET last_in_stock = true
                    WHERE id = %s AND last_in_stock = false
                    RETURNING id;
                    """,
                    (monitor_id,)          # <-- trailing comma
                )
                row = cur.fetchone()
                return row is not None      # True = I won the transition, alert
            else:
                # SOLD OUT: re-arm by writing false back. Never alerts.
                cur.execute(
                   """
                    UPDATE monitors SET last_in_stock = false 
                    WHERE id = %s AND last_in_stock = true
                    RETURNING id;
                    """,
                    (monitor_id,)    
                )
                return False



def fail_job(job_id, node_id):
    """Worker reports its job errored. Requeue if under the ceiling, else dead-letter.
    Ownership-guarded on node_id, same as complete_job — a zombie can't fail someone
    else's job. Returns ('requeued'|'dead'|None, attempts)."""
    with psycopg.connect(CONN) as conn:
        with conn.cursor() as cur:
            # KILL branch: at/over ceiling -> dead. Guarded on ownership + status.
            cur.execute(
                """
                UPDATE jobs
                SET status = 'dead'
                WHERE id = %s AND status = 'in_progress' AND node_id = %s
                  AND attempts >= %s
                RETURNING id;
                """,
                (job_id, node_id, ATTEMPT_CEILING)
            )
            if cur.fetchone() is not None:
                return "dead"

            # REQUEUE branch: under ceiling -> back to queued for retry.
            cur.execute(
                """
                UPDATE jobs
                SET status = 'queued', node_id = NULL, started_at = NULL
                WHERE id = %s AND status = 'in_progress' AND node_id = %s
                  AND attempts < %s
                RETURNING id;
                """,
                (job_id, node_id, ATTEMPT_CEILING)
            )
            if cur.fetchone() is not None:
                return "requeued"

            return None   # guard blocked: not owner, or not in_progress (zombie/stale)

def get_all_jobs():
    with psycopg.connect(CONN) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, monitor_id, status, node_id, attempts,
                       scheduled_at, started_at, completed_at
                FROM jobs
                ORDER BY id;
                """
            )
            cols = [c.name for c in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]

# ─────────────────────────────────────────────
# Reaper background loop
# ─────────────────────────────────────────────

async def reaper_loop():
    while True:
        try:
            reaped, dead = reap_jobs()
            if reaped:
                print(f"reaped jobs {reaped}")
            if dead:
                print(f"dead-lettered jobs {dead}")
        except Exception as e:
            print(f"reaper sweep failed: {e}")
        await asyncio.sleep(5)             # 30 in prod

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(reaper_loop())     # fire-and-forget
    yield
    task.cancel()

app = FastAPI(lifespan=lifespan)


class ClaimRequest(BaseModel):
    node_id: int

class CompleteRequest(BaseModel):
       job_id: int
       node_id: int
       in_stock: bool


class FailRequest(BaseModel):
    job_id: int
    node_id: int

@app.post("/fail")
def fail_endpoint(req: FailRequest):
    result = fail_job(req.job_id, req.node_id)
    if result is None:
        raise HTTPException(status_code=409, detail="fail rejected: not the owner")
    return {"outcome": result}   # "requeued" or "dead"
    
@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/claim")
def claim_endpoint(req: ClaimRequest):
    result = claim_job(req.node_id)
    if result is not None:
        return result                 
    else:
        return {"job_id": None}

@app.post("/complete")
def complete_endpoint(req: CompleteRequest):
    result = complete_job(req.job_id, req.node_id, req.in_stock)
    if result is None:
        raise HTTPException(status_code=409, detail="completion rejected: not the owner")
    return {"job_id": result}

@app.websocket("/ws")
async def ws_jobs(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.send_text(json.dumps(get_all_jobs(), default=str))
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
