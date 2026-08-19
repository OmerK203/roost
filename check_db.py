import psycopg

def claim_job(node_id):
    with psycopg.connect("host=localhost port=5432 dbname=roost user=postgres password=roost") as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE jobs
                SET status = 'in_progress', node_id = %s, started_at = now(), attempts = attempts + 1
                    WHERE id = (
                    SELECT id FROM jobs
                    WHERE status = 'queued' AND scheduled_at <= now()
                    ORDER BY scheduled_at, id
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                    )
                    RETURNING id;
                """,
                (node_id,)
            )
            row = cur.fetchone()
            # YOUR None-check and return here
            return row[0] if row else None

result = claim_job(1)
print(result)