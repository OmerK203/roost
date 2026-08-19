import { useEffect, useMemo, useState } from "react";

type Job = {
  id: number;
  monitor_id: number;
  status: string;
  node_id: number | null;
  attempts: number;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
};

const STATUS_ORDER = ["queued", "in_progress", "done", "dead"] as const;

function fmtTime(iso: string | null): string {
  if (!iso) return "—";

  const d = new Date(iso);

  if (isNaN(d.getTime())) {
    return "—";
  }

  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatStatus(status: string): string {
  return status.replace("_", " ");
}

function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket("ws://127.0.0.1:8000/ws");

    ws.onopen = () => {
      console.log("WebSocket connected");
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data: Job[] = JSON.parse(event.data);
        setJobs(data);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  const counts = useMemo(() => {
    const count: Record<string, number> = {
      queued: 0,
      in_progress: 0,
      done: 0,
      dead: 0,
    };

    for (const job of jobs) {
      count[job.status] = (count[job.status] ?? 0) + 1;
    }

    return count;
  }, [jobs]);

  const activeWorkers = useMemo(() => {
    const workers = new Map<number, number>();

    for (const job of jobs) {
      if (job.status === "in_progress" && job.node_id != null) {
        workers.set(
          job.node_id,
          (workers.get(job.node_id) ?? 0) + 1
        );
      }
    }

    return [...workers.entries()].sort((a, b) => a[0] - b[0]);
  }, [jobs]);

  return (
    <div className="app">
      <style>{CSS}</style>

      <aside className="sidebar">
        <div>
          <div className="logo">
            <div className="logo-mark">
              <span />
              <span />
              <span />
              <span />
            </div>

            <div>
              <div className="logo-text">Roost</div>
              <div className="logo-subtitle">Job infrastructure</div>
            </div>
          </div>

          <div className="nav-section">
            <div className="nav-label">Overview</div>

            <nav>
              <a className="nav-item active">
                <span className="nav-icon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" />
                  </svg>
                </span>

                <span>Dashboard</span>
              </a>

              <a className="nav-item">
                <span className="nav-icon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M8 6h13" />
                    <path d="M8 12h13" />
                    <path d="M8 18h13" />
                    <path d="M3 6h.01" />
                    <path d="M3 12h.01" />
                    <path d="M3 18h.01" />
                  </svg>
                </span>

                <span>Jobs</span>
              </a>

              <a className="nav-item">
                <span className="nav-icon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <rect x="4" y="4" width="16" height="16" rx="3" />
                    <path d="M9 9h6v6H9z" />
                    <path d="M9 2v2" />
                    <path d="M15 2v2" />
                    <path d="M9 20v2" />
                    <path d="M15 20v2" />
                    <path d="M20 9h2" />
                    <path d="M20 14h2" />
                    <path d="M2 9h2" />
                    <path d="M2 14h2" />
                  </svg>
                </span>

                <span>Workers</span>
              </a>

              <a className="nav-item">
                <span className="nav-icon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 1.7-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20h-2.4v-.2a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-1.7-1.7.06-.06A1.7 1.7 0 0 0 8.4 15a1.7 1.7 0 0 0-1.56-1.03H6v-2.4h.2A1.7 1.7 0 0 0 7.76 10a1.7 1.7 0 0 0-.34-1.88l-.06-.06 1.7-1.7.06.06A1.7 1.7 0 0 0 11 6.76 1.7 1.7 0 0 0 12.03 5.2V5h2.4v.2A1.7 1.7 0 0 0 15.46 6.76a1.7 1.7 0 0 0 1.88-.34l.06-.06 1.7 1.7-.06.06A1.7 1.7 0 0 0 18.7 10a1.7 1.7 0 0 0 1.56 1.03h.2v2.4h-.2A1.7 1.7 0 0 0 19.4 15Z" />
                  </svg>
                </span>

                <span>Monitors</span>
              </a>
            </nav>
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className={`connection ${connected ? "online" : "offline"}`}>
            <span className="connection-indicator">
              <span />
            </span>

            <div>
              <div className="connection-title">
                {connected ? "System online" : "System offline"}
              </div>

              <div className="connection-subtitle">
                {connected ? "Live updates enabled" : "Connection lost"}
              </div>
            </div>
          </div>

          <div className="version">
            <span>Roost</span>
            <span>v1.0.0</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="page-header">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              Real-time infrastructure
            </div>

            <h1>Dashboard</h1>

            <p>
              Monitor your job queue and worker activity in real time.
            </p>
          </div>

          <div className="header-status">
            <span
              className={`status-dot ${
                connected ? "online" : "offline"
              }`}
            />

            <span>
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </header>

        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-top">
              <span className="stat-label">Queued</span>

              <span className="stat-icon queued">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M4 7h16" />
                  <path d="M7 4h10" />
                  <rect x="4" y="7" width="16" height="13" rx="2" />
                  <path d="M9 12h6" />
                </svg>
              </span>
            </div>

            <div className="stat-value">
              {counts.queued ?? 0}
            </div>

            <div className="stat-description">
              Waiting to be processed
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span className="stat-label">In progress</span>

              <span className="stat-icon progress">
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 8v4l2.5 2.5" />
                </svg>
              </span>
            </div>

            <div className="stat-value">
              {counts.in_progress ?? 0}
            </div>

            <div className="stat-description">
              Currently processing
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span className="stat-label">Completed</span>

              <span className="stat-icon done">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </span>
            </div>

            <div className="stat-value">
              {counts.done ?? 0}
            </div>

            <div className="stat-description">
              Successfully completed
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span className="stat-label">Failed</span>

              <span className="stat-icon dead">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M8 8l8 8" />
                  <path d="m16 8-8 8" />
                  <circle cx="12" cy="12" r="8" />
                </svg>
              </span>
            </div>

            <div className="stat-value">
              {counts.dead ?? 0}
            </div>

            <div className="stat-description">
              Jobs requiring attention
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span className="stat-label">Total jobs</span>

              <span className="stat-icon total">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M5 5h14v14H5z" />
                  <path d="M9 9h6" />
                  <path d="M9 13h6" />
                  <path d="M9 17h3" />
                </svg>
              </span>
            </div>

            <div className="stat-value">
              {jobs.length}
            </div>

            <div className="stat-description">
              Jobs in the queue
            </div>
          </div>
        </section>

        <div className="dashboard-grid">
          <section className="card jobs-card">
            <div className="card-header">
              <div>
                <div className="card-title-row">
                  <h2>Jobs</h2>

                  <span className="count-badge">
                    {jobs.length}
                  </span>
                </div>

                <p>Recent queue activity</p>
              </div>

              <div className="live-label">
                <span className="live-dot" />
                Live
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Monitor</th>
                    <th>Status</th>
                    <th>Node</th>
                    <th>Attempts</th>
                    <th>Started</th>
                    <th>Completed</th>
                  </tr>
                </thead>

                <tbody>
                  {jobs.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="empty-state">
                          <div className="empty-icon">
                            <svg viewBox="0 0 24 24" fill="none">
                              <rect
                                x="4"
                                y="5"
                                width="16"
                                height="14"
                                rx="2"
                              />
                              <path d="M8 9h8" />
                              <path d="M8 13h5" />
                            </svg>
                          </div>

                          <strong>No jobs yet</strong>

                          <span>
                            Waiting for jobs to appear in the queue.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    jobs.map((job) => (
                      <tr key={job.id}>
                        <td>
                          <span className="job-id">
                            #{job.id}
                          </span>
                        </td>

                        <td>
                          <span className="mono muted">
                            {job.monitor_id}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`badge b-${job.status}`}
                          >
                            <span className="badge-dot" />
                            {formatStatus(job.status)}
                          </span>
                        </td>

                        <td>
                          {job.node_id != null ? (
                            <span className="node-pill">
                              node-{job.node_id}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>

                        <td>
                          <span
                            className={`attempts ${
                              job.attempts >= 8 ? "hot" : ""
                            }`}
                          >
                            {job.attempts}
                          </span>
                        </td>

                        <td>
                          <span className="mono muted">
                            {fmtTime(job.started_at)}
                          </span>
                        </td>

                        <td>
                          <span className="mono muted">
                            {fmtTime(job.completed_at)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {jobs.length > 0 && (
              <div className="table-footer">
                <span>
                  Showing <strong>{jobs.length}</strong> jobs
                </span>

                <span>
                  Updated in real time
                </span>
              </div>
            )}
          </section>

          <section className="card workers-card">
            <div className="card-header">
              <div>
                <div className="card-title-row">
                  <h2>Active workers</h2>

                  <span className="count-badge">
                    {activeWorkers.length}
                  </span>
                </div>

                <p>Currently processing jobs</p>
              </div>
            </div>

            {activeWorkers.length === 0 ? (
              <div className="worker-empty">
                <div className="worker-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <rect
                      x="4"
                      y="4"
                      width="16"
                      height="16"
                      rx="3"
                    />
                    <path d="M9 9h6v6H9z" />
                  </svg>
                </div>

                <strong>No active workers</strong>

                <span>
                  Workers will appear here when they begin processing
                  jobs.
                </span>
              </div>
            ) : (
              <ul className="workers">
                {activeWorkers.map(([node, count]) => (
                  <li key={node}>
                    <div className="worker-avatar">
                      {node}
                    </div>

                    <div className="worker-info">
                      <span className="worker-name">
                        Node {node}
                      </span>

                      <span className="worker-status">
                        <span className="worker-online-dot" />
                        Processing
                      </span>
                    </div>

                    <div className="worker-jobs">
                      <strong>{count}</strong>

                      <span>
                        job{count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

const CSS = `
:root {
  --bg: #0b0e14;
  --sidebar: #0d1017;
  --surface: #11151d;
  --surface-hover: #171c25;
  --surface-soft: #151a23;
  --border: #222936;
  --border-light: #2a3240;

  --text: #f1f3f7;
  --text-secondary: #b0b7c5;
  --muted: #737c8d;

  --blue: #5b6ff7;
  --blue-light: #8d9aff;
  --blue-soft: rgba(91, 111, 247, 0.12);

  --green: #48d597;
  --green-soft: rgba(72, 213, 151, 0.11);

  --yellow: #e8b957;
  --yellow-soft: rgba(232, 185, 87, 0.11);

  --red: #ef6d78;
  --red-soft: rgba(239, 109, 120, 0.11);
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
  background: var(--bg);
}

body {
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

  color: var(--text);

  background:
    radial-gradient(
      900px 500px at 20% -10%,
      rgba(91, 111, 247, 0.08),
      transparent 60%
    ),
    var(--bg);
}

button,
a {
  font: inherit;
}

.mono {
  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;
}

.muted {
  color: var(--muted);
}

/* -------------------------------- */
/* Layout                           */
/* -------------------------------- */

.app {
  min-height: 100vh;
  display: flex;
  width: 100%;
  color: var(--text);
}

/* -------------------------------- */
/* Sidebar                          */
/* -------------------------------- */

.sidebar {
  width: 244px;
  min-height: 100vh;
  flex-shrink: 0;

  display: flex;
  flex-direction: column;
  justify-content: space-between;

  padding: 24px 14px 18px;

  background: var(--sidebar);
  border-right: 1px solid var(--border);
}

.logo {
  display: flex;
  align-items: center;
  gap: 11px;

  padding: 4px 12px 30px;
}

.logo-mark {
  width: 28px;
  height: 28px;

  display: grid;
  grid-template-columns: repeat(2, 9px);
  grid-template-rows: repeat(2, 9px);
  gap: 3px;

  transform: rotate(45deg);
}

.logo-mark span {
  display: block;
  background: var(--blue);
  border-radius: 2px;
}

.logo-mark span:nth-child(2),
.logo-mark span:nth-child(3) {
  opacity: 0.55;
}

.logo-text {
  font-size: 19px;
  line-height: 1;
  font-weight: 750;
  letter-spacing: -0.5px;
}

.logo-subtitle {
  margin-top: 5px;

  font-size: 10px;
  line-height: 1;

  color: var(--muted);
  letter-spacing: 0.2px;
}

.nav-section {
  margin-top: 2px;
}

.nav-label {
  padding: 0 13px 9px;

  font-size: 10px;
  font-weight: 700;
  color: #596273;

  text-transform: uppercase;
  letter-spacing: 0.9px;
}

nav {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;

  padding: 10px 12px;

  border-radius: 8px;

  color: var(--muted);
  text-decoration: none;

  font-size: 13px;
  font-weight: 550;

  cursor: pointer;

  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.nav-item:hover {
  background: var(--surface-hover);
  color: var(--text-secondary);
}

.nav-item.active {
  color: #fff;
  background: var(--blue-soft);
}

.nav-item.active .nav-icon {
  color: var(--blue-light);
}

.nav-icon {
  width: 18px;
  height: 18px;

  display: flex;
  align-items: center;
  justify-content: center;

  color: #697385;
}

.nav-icon svg {
  width: 16px;
  height: 16px;

  stroke: currentColor;
  stroke-width: 1.7;

  stroke-linecap: round;
  stroke-linejoin: round;
}

.sidebar-bottom {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.connection {
  display: flex;
  align-items: center;
  gap: 10px;

  padding: 11px 12px;

  border: 1px solid var(--border);
  border-radius: 9px;

  background: rgba(255, 255, 255, 0.015);
}

.connection-indicator {
  width: 8px;
  height: 8px;

  display: flex;
  align-items: center;
  justify-content: center;

  border-radius: 50%;
}

.connection-indicator span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.connection.online .connection-indicator span {
  background: var(--green);
  box-shadow: 0 0 0 3px var(--green-soft);
  animation: pulse 1.8s infinite;
}

.connection.offline .connection-indicator span {
  background: var(--red);
  box-shadow: 0 0 0 3px var(--red-soft);
}

.connection-title {
  font-size: 12px;
  font-weight: 650;
}

.connection-subtitle {
  margin-top: 2px;

  font-size: 10px;
  color: var(--muted);
}

.version {
  display: flex;
  justify-content: space-between;

  padding: 0 4px;

  font-size: 10px;
  color: #505969;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.45;
  }
}

/* -------------------------------- */
/* Main                             */
/* -------------------------------- */

.main {
  flex: 1;
  min-width: 0;
  width: calc(100vw - 244px);

  padding: 38px 32px 50px;
}

.main > * {
  width: 100%;
  max-width: none;

  margin-left: 0;
  margin-right: 0;
}

/* -------------------------------- */
/* Header                           */
/* -------------------------------- */

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;

  margin-bottom: 28px;
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 7px;

  margin-bottom: 8px;

  font-size: 11px;
  font-weight: 650;

  color: var(--blue-light);
  text-transform: uppercase;
  letter-spacing: 0.75px;
}

.eyebrow-dot {
  width: 5px;
  height: 5px;

  border-radius: 50%;
  background: var(--blue);
}

.page-header h1 {
  margin: 0;

  font-size: 27px;
  line-height: 1.15;

  font-weight: 750;
  letter-spacing: -0.7px;
}

.page-header p {
  margin: 7px 0 0;

  color: var(--muted);
  font-size: 13px;
}

.header-status {
  display: flex;
  align-items: center;
  gap: 8px;

  padding: 8px 11px;

  border: 1px solid var(--border);
  border-radius: 7px;

  background: var(--surface);

  color: var(--text-secondary);

  font-size: 11px;
  font-weight: 600;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-dot.online {
  background: var(--green);
  box-shadow: 0 0 0 3px var(--green-soft);
}

.status-dot.offline {
  background: var(--red);
  box-shadow: 0 0 0 3px var(--red-soft);
}

/* -------------------------------- */
/* Stat cards                       */
/* -------------------------------- */

.stats-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;

  width: 100%;
  margin-bottom: 20px;
}

.stat-card {
  min-width: 0;

  padding: 17px 18px 16px;

  border: 1px solid var(--border);
  border-radius: 10px;

  background: var(--surface);

  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.015);

  transition:
    border-color 0.15s ease,
    transform 0.15s ease;
}

.stat-card:hover {
  border-color: var(--border-light);
  transform: translateY(-1px);
}

.stat-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-label {
  color: var(--text-secondary);

  font-size: 11px;
  font-weight: 600;

  text-transform: uppercase;
  letter-spacing: 0.55px;
}

.stat-icon {
  width: 30px;
  height: 30px;

  display: flex;
  align-items: center;
  justify-content: center;

  border-radius: 7px;
}

.stat-icon svg {
  width: 16px;
  height: 16px;

  stroke: currentColor;
  stroke-width: 1.7;

  stroke-linecap: round;
  stroke-linejoin: round;
}

.stat-icon.queued {
  color: var(--blue-light);
  background: var(--blue-soft);
}

.stat-icon.progress {
  color: var(--yellow);
  background: var(--yellow-soft);
}

.stat-icon.done {
  color: var(--green);
  background: var(--green-soft);
}

.stat-icon.dead {
  color: var(--red);
  background: var(--red-soft);
}

.stat-icon.total {
  color: #b69aff;
  background: rgba(155, 126, 255, 0.11);
}

.stat-value {
  margin-top: 17px;

  font-size: 25px;
  line-height: 1;

  font-weight: 720;
  letter-spacing: -0.5px;
}

.stat-description {
  margin-top: 7px;

  color: var(--muted);

  font-size: 10px;
}

/* -------------------------------- */
/* Dashboard cards                  */
/* -------------------------------- */

.dashboard-grid {
  display: grid;

  grid-template-columns:
    minmax(0, 1fr)
    280px;

  gap: 20px;

  align-items: start;
}

.card {
  overflow: hidden;

  border: 1px solid var(--border);
  border-radius: 10px;

  background: var(--surface);

  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.01);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;

  padding: 18px 20px;

  border-bottom: 1px solid var(--border);
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-header h2 {
  margin: 0;

  font-size: 14px;
  font-weight: 650;
  letter-spacing: -0.15px;
}

.card-header p {
  margin: 5px 0 0;

  font-size: 11px;
  color: var(--muted);
}

.count-badge {
  min-width: 20px;
  height: 20px;

  display: inline-flex;
  align-items: center;
  justify-content: center;

  padding: 0 6px;

  border-radius: 5px;

  color: var(--text-secondary);
  background: var(--surface-soft);

  font-size: 10px;
  font-weight: 650;
}

.live-label {
  display: flex;
  align-items: center;
  gap: 6px;

  color: var(--green);

  font-size: 10px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.45px;
}

.live-dot {
  width: 5px;
  height: 5px;

  border-radius: 50%;
  background: var(--green);

  box-shadow: 0 0 0 3px var(--green-soft);
}

/* -------------------------------- */
/* Table                            */
/* -------------------------------- */

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 760px;

  border-collapse: collapse;
}

thead th {
  padding: 11px 20px;

  text-align: left;

  color: #626c7d;

  font-size: 9px;
  font-weight: 700;

  text-transform: uppercase;
  letter-spacing: 0.8px;

  border-bottom: 1px solid var(--border);
}

tbody tr {
  transition: background 0.12s ease;
}

tbody tr:hover {
  background: var(--surface-hover);
}

tbody td {
  padding: 12px 20px;

  border-bottom: 1px solid rgba(34, 41, 54, 0.75);

  font-size: 12px;
}

tbody tr:last-child td {
  border-bottom: none;
}

.job-id {
  color: #d8dce5;

  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;

  font-size: 11px;
  font-weight: 650;
}

.node-pill {
  display: inline-flex;
  align-items: center;

  padding: 4px 7px;

  border: 1px solid var(--border);
  border-radius: 5px;

  background: var(--surface-soft);

  color: var(--text-secondary);

  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;

  font-size: 10px;
}

.attempts {
  color: var(--text-secondary);

  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;

  font-size: 11px;
}

.attempts.hot {
  color: var(--red);
  font-weight: 700;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  padding: 4px 8px;

  border-radius: 5px;

  font-size: 10px;
  font-weight: 600;

  text-transform: capitalize;
}

.badge-dot {
  width: 5px;
  height: 5px;

  border-radius: 50%;
}

.b-queued {
  color: var(--blue-light);
  background: var(--blue-soft);
}

.b-queued .badge-dot {
  background: var(--blue-light);
}

.b-in_progress {
  color: var(--yellow);
  background: var(--yellow-soft);
}

.b-in_progress .badge-dot {
  background: var(--yellow);
  animation: pulse 1.5s infinite;
}

.b-done {
  color: var(--green);
  background: var(--green-soft);
}

.b-done .badge-dot {
  background: var(--green);
}

.b-dead {
  color: var(--red);
  background: var(--red-soft);
}

.b-dead .badge-dot {
  background: var(--red);
}

.table-footer {
  display: flex;
  justify-content: space-between;

  padding: 10px 20px;

  border-top: 1px solid var(--border);

  color: var(--muted);

  font-size: 10px;
}

.table-footer strong {
  color: var(--text-secondary);
}

/* -------------------------------- */
/* Empty states                     */
/* -------------------------------- */

.empty-state {
  min-height: 220px;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  gap: 5px;

  color: var(--muted);
}

.empty-state strong {
  margin-top: 5px;

  color: var(--text-secondary);

  font-size: 12px;
  font-weight: 600;
}

.empty-state span {
  font-size: 10px;
}

.empty-icon {
  width: 36px;
  height: 36px;

  display: flex;
  align-items: center;
  justify-content: center;

  border: 1px solid var(--border);
  border-radius: 8px;

  background: var(--surface-soft);

  color: #657083;
}

.empty-icon svg {
  width: 17px;
  height: 17px;

  stroke: currentColor;
  stroke-width: 1.5;

  stroke-linecap: round;
  stroke-linejoin: round;
}

/* -------------------------------- */
/* Workers                          */
/* -------------------------------- */

.workers {
  list-style: none;

  margin: 0;
  padding: 8px;
}

.workers li {
  display: flex;
  align-items: center;
  gap: 11px;

  padding: 11px;

  border-radius: 8px;

  transition: background 0.12s ease;
}

.workers li:hover {
  background: var(--surface-hover);
}

.worker-avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;

  display: flex;
  align-items: center;
  justify-content: center;

  border: 1px solid rgba(91, 111, 247, 0.22);
  border-radius: 8px;

  background: var(--blue-soft);

  color: var(--blue-light);

  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;

  font-size: 10px;
  font-weight: 700;
}

.worker-info {
  min-width: 0;

  display: flex;
  flex-direction: column;
  gap: 4px;
}

.worker-name {
  color: var(--text-secondary);

  font-size: 11px;
  font-weight: 650;
}

.worker-status {
  display: flex;
  align-items: center;
  gap: 5px;

  color: var(--muted);

  font-size: 9px;
}

.worker-online-dot {
  width: 4px;
  height: 4px;

  border-radius: 50%;
  background: var(--green);
}

.worker-jobs {
  margin-left: auto;

  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.worker-jobs strong {
  color: var(--text-secondary);

  font-size: 12px;
  font-weight: 650;
}

.worker-jobs span {
  color: var(--muted);

  font-size: 9px;
}

.worker-empty {
  min-height: 220px;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  padding: 25px;

  text-align: center;
}

.worker-empty-icon {
  width: 36px;
  height: 36px;

  display: flex;
  align-items: center;
  justify-content: center;

  margin-bottom: 10px;

  border: 1px solid var(--border);
  border-radius: 8px;

  background: var(--surface-soft);

  color: #657083;
}

.worker-empty-icon svg {
  width: 17px;
  height: 17px;

  stroke: currentColor;
  stroke-width: 1.5;

  stroke-linecap: round;
  stroke-linejoin: round;
}

.worker-empty strong {
  color: var(--text-secondary);

  font-size: 12px;
  font-weight: 600;
}

.worker-empty span {
  max-width: 220px;

  margin-top: 5px;

  color: var(--muted);

  font-size: 10px;
  line-height: 1.5;
}

/* -------------------------------- */
/* Responsive                       */
/* -------------------------------- */

@media (max-width: 1200px) {
  .stats-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .workers-card {
    min-height: auto;
  }

  .worker-empty {
    min-height: 170px;
  }
}

@media (max-width: 800px) {
  .sidebar {
    width: 68px;
    padding: 20px 9px;
  }

  .main {
    width: calc(100vw - 68px);
    padding: 28px 22px 40px;
  }

  .logo {
    justify-content: center;
    padding: 4px 0 28px;
  }

  .logo > div:last-child,
  .nav-label,
  .nav-item span:last-child,
  .connection > div,
  .version {
    display: none;
  }

  .nav-item {
    justify-content: center;
    padding: 11px;
  }

  .connection {
    justify-content: center;
    padding: 12px;
  }
}

@media (max-width: 620px) {
  .main {
    width: 100%;
    padding: 24px 15px 30px;
  }

  .page-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 15px;
  }

  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .stat-card:last-child {
    grid-column: span 2;
  }

  .dashboard-grid {
    gap: 14px;
  }

  .card-header {
    padding: 15px;
  }

  thead th,
  tbody td {
    padding-left: 14px;
    padding-right: 14px;
  }

  .table-footer {
    padding-left: 14px;
    padding-right: 14px;
  }
}

@media (max-width: 400px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .stat-card:last-child {
    grid-column: auto;
  }

  .sidebar {
    display: none;
  }
}
`;

export default App;