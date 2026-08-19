# Roost

A distributed job queue with lease-based failure recovery, built on Postgres and FastAPI. Workers claim work atomically, a reaper reclaims jobs abandoned by dead workers, and a dead-letter queue catches poison jobs. A live React dashboard streams queue state over a WebSocket.

The demo application on top is an availability monitor — it polls sources that change without warning (retail restocks, campsite cancellations, marketplace listings) and detects the moment something becomes available. But the monitoring is a thin plug-in; the substance of the project is the queue underneath it. A restock check is just one worker type. A GPU inference task would be one more.

## Why this design

The organizing idea is **"you can only push from a database you own."**

The system has two loops. The **outer loop** watches third-party sites — you don't own their databases, so they can't notify you when something changes. Your only option is to poll on a schedule. The **inner loop** is Roost's own job queue in Postgres — you *do* own that, so the dashboard can be pushed to over a WebSocket instead of polled. The dashboard is that thesis made visible: the browser never asks for updates, the server pushes them.

## Architecture

```
                 ┌──────────────┐
   HTTP (claim/   │   FastAPI    │   WebSocket push
   complete/fail) │  (main.py)   │   (job snapshots)
        ┌────────▶│ control plane├────────▶  React dashboard
        │         │  owns the DB │
   ┌────┴────┐    └──────┬───────┘
   │ workers │           │ direct SQL
   │ (N procs)│          ▼
   │ HTTP-only│    ┌──────────┐
   └─────────┘     │ Postgres │
                   └──────────┘
```

**Control plane / data plane split.** `main.py` is the only process that touches Postgres — it hands out jobs, records results, and runs the reaper. Workers (`worker.py`) are pure HTTP clients with no database access. This boundary is deliberate: workers hold no credentials, don't consume connection-pool slots, and can be written in any language. Adding workers scales throughput; the database guarantees safety, so scaling out costs no extra coordination.

## The hard parts

**Atomic claim under concurrency.** Many workers race to claim from one queue. The claim is a single query:

```sql
UPDATE jobs SET status='in_progress', node_id=%s, started_at=now(), attempts=attempts+1
WHERE jobs.id = (
    SELECT id FROM jobs
    WHERE status='queued' AND scheduled_at <= now()
    ORDER BY scheduled_at, id
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
```

`FOR UPDATE SKIP LOCKED` is the whole concurrency story. A worker locks exactly one queued row; any worker racing it skips the locked row and takes the next instead of blocking or grabbing a duplicate. No coordinator, no lock service, no broker — Postgres is the concurrency primitive.

**Lease-based failure recovery (the reaper).** `started_at` is a lease clock. A background task sweeps for jobs stuck `in_progress` past a timeout and requeues them, so a silently-dead worker's job doesn't stall forever. The reaper's own sweep is wrapped in an inside-the-loop try/except: the one bug it can't have is dying silently, since dying silently is exactly the failure it exists to detect.

**Ownership guards against zombies.** The reaper reassigns an abandoned job to a new worker — then the original worker thaws and tries to complete the job it lost. Every write path (`complete`, `fail`, and the reaper itself) guards on `node_id`, not just `job_id`: the job id is identical for the old and new worker, so only the `node_id` stamp can tell them apart. A stale worker's completion is rejected with a 409 and it moves on.

**At-least-once execution, exactly-once effect.** Because the reaper can requeue a job, a job body may run twice — so the *effect* has to be idempotent even though the *execution* isn't. Alerts dedup on the state transition, not the job:

```sql
UPDATE monitors SET last_in_stock=true
WHERE id=%s AND last_in_stock=false
RETURNING id;
```

Whoever's update returns a row won the false→true transition and sends the alert. A duplicate run finds `last_in_stock` already true, matches zero rows, and stays silent. The same weapon as the claim guard: the condition lives in the `WHERE`, and "did I change a row" decides the action — no read-then-write race.

**Dead-letter queue.** A poison job (a URL that always 404s, a parser that always throws) would otherwise be requeued forever, burning a worker slot each cycle. `attempts` is the retry budget; when it's spent, the job moves to a terminal `dead` status at both requeue doors — the reaper (stall path) and `/fail` (fast-fail path). `dead` is a status rather than a separate table, so dead jobs stay visible in the dashboard's normal query.

## Live dashboard

A React + TypeScript dashboard renders queue state in real time. The server holds an open WebSocket and pushes a full job snapshot once a second; the browser only listens and re-renders. Workers appear automatically — a worker holding a job just *is* an `in_progress` row with a `node_id`, so the "active workers" panel is derived from job data with no separate registry.

The server-to-Postgres link is itself a poll (a 1-second query loop) rather than `LISTEN/NOTIFY` — the same "polling is correct at small scale" call made for the inner queue. The browser still receives genuine pushes, so it feels live.

## Stack

- **Backend:** Python, FastAPI, Pydantic, psycopg (v3)
- **Database:** PostgreSQL
- **Workers:** standalone Python processes (HTTP only)
- **Frontend:** React, TypeScript, Vite

## Running it

Requires Docker (for Postgres) and Node 18+.

**1. Start Postgres and create the schema:**

```bash
docker exec -it roost-pg psql -U postgres -d roost
```

```sql
CREATE TABLE jobs (
  id bigserial PRIMARY KEY, monitor_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'queued', scheduled_at timestamptz NOT NULL,
  started_at timestamptz, node_id bigint,
  attempts int NOT NULL DEFAULT 0, completed_at timestamptz);
CREATE INDEX idx_claim ON jobs (scheduled_at) WHERE status='queued';

CREATE TABLE monitors (
  id bigserial PRIMARY KEY,
  last_in_stock boolean NOT NULL DEFAULT false,
  url text);
INSERT INTO monitors (id, url) VALUES (1, 'MOCK');
```

**2. Run the API** (installs the WebSocket-capable server):

```bash
pip install 'uvicorn[standard]' fastapi psycopg
uvicorn main:app --reload
```

**3. Run the dashboard:**

```bash
cd roost-dashboard
npm install
npm run dev
```

**4. Seed some jobs and start workers** (each argument is the worker's node id):

```bash
# seed 60 jobs due now
docker exec -it roost-pg psql -U postgres -d roost \
  -c "INSERT INTO jobs (monitor_id, status, scheduled_at)
      SELECT 1, 'queued', now() FROM generate_series(1, 60);"

python worker.py 1
python worker.py 2
python worker.py 3
```

Open the dashboard and watch three workers drain the queue — claims stay disjoint across workers, jobs march `queued → in_progress → done`, and the active-workers panel fills in live.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/health`  | liveness check |
| `POST` | `/claim`   | atomically claim the next due job; returns job + monitor url, or `null` when the queue is empty |
| `POST` | `/complete`| mark a job done and record the observation; 409 if the caller isn't the owner |
| `POST` | `/fail`    | report a failed job; requeues or dead-letters depending on the retry budget; 409 if not the owner |
| `WS`   | `/ws`      | streams a full job snapshot once per second |

## Status and scope

Built: data model, atomic claim, worker-as-process, change-detection/idempotency, reaper, dead-letter queue, and the live dashboard.

The monitoring layer is intentionally thin. `check_stock(url)` — the work a worker does when it claims a job — is a pluggable function; the demo uses a mock signal so transitions are deterministic. Pointing it at a real source (a retail endpoint, a headless-browser scrape) is a change to that one function and nothing else — the queue, claim, reaper, and dedup don't move.

**Known trade-offs, by design:**

- The reaper is embedded in the API process for operational simplicity. That makes it a singleton only as long as the API is a single process; horizontally scaling the API means pulling the reaper into its own process or gating it behind leader election.
- `record_observation` and the job-status update are two writes on two connections, so a crash between them is possible. They're ordered so the recoverable outcome wins (a retry, not a lost observation), but the fully-correct version folds them into one transaction.
- Database access in the request path is synchronous (psycopg), which blocks the event loop for the duration of each query. Fine at this scale; at higher concurrency it would move to psycopg's async connection or a thread offload.

**Not built (talking points):** capability-based routing (workers advertising what job types they can handle), and a set-difference detection model for search-style sources like marketplace listings, where the primitive is "a result I haven't seen before" rather than a single boolean transition.
