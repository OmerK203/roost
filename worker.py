import time
import sys
import requests
import random

NODE_ID = int(sys.argv[1])
BASE_URL = "http://127.0.0.1:8000"

def check_stock(url: str) -> bool:
    # Mock signal so the demo produces live transitions.
    # Real version would fetch(url) and parse the "in stock" indicator.
    return random.random() < 0.3

while True:
    resp = requests.post(f"{BASE_URL}/claim", json={"node_id": NODE_ID})

    if resp.status_code != 200:
        print(f"[node {NODE_ID}] claim failed: {resp.status_code} {resp.text}")
        time.sleep(2)
        continue

    data = resp.json()
    job_id = data["job_id"]

    if job_id is None:
        time.sleep(2)
        continue

    url = data["url"]
    monitor_id = data["monitor_id"]
    print(f"[node {NODE_ID}] claimed job {job_id} (monitor {monitor_id}, url={url})")

    try:
        in_stock = check_stock(url)
        time.sleep(3)  # simulate work

        resp = requests.post(f"{BASE_URL}/complete", json={
            "job_id": job_id,
            "node_id": NODE_ID,
            "in_stock": in_stock,
        })

        if resp.status_code == 200:
            print(f"[node {NODE_ID}] job {job_id} done, in_stock={in_stock}")
        elif resp.status_code == 409:
            print(f"[node {NODE_ID}] job {job_id} rejected (not owner) — moving on")
        else:
            print(f"[node {NODE_ID}] job {job_id} unexpected {resp.status_code} {resp.text}")

    except Exception as e:
        print(f"[node {NODE_ID}] job {job_id} errored: {e} — failing")
        requests.post(f"{BASE_URL}/fail", json={"job_id": job_id, "node_id": NODE_ID})