# CCAM monitoring stack (Prometheus + Grafana)

A turnkey [Prometheus](https://prometheus.io/) + [Grafana](https://grafana.com/)
stack that scrapes the dashboard's [`GET /api/metrics`](../docs/API.md#metrics)
endpoint and renders a pre-built **CCAM — Overview** board. Use it to watch live
sessions, agent states, event throughput, and token burn from the same
observability stack as the rest of your infra.

```
monitoring/
├── docker-compose.yml                     # Prometheus + Grafana
├── prometheus/prometheus.yml              # scrape config (targets the dashboard)
└── grafana/
    ├── provisioning/datasources/…         # Prometheus datasource (auto)
    ├── provisioning/dashboards/…          # dashboard provider (auto)
    └── dashboards/ccam-overview.json      # the CCAM board (auto-loaded)
```

## Quick start

1. **Start the dashboard so the container can scrape it.** The server's
   DNS-rebinding guard only accepts loopback `Host` headers, and Prometheus (in
   Docker) reaches the host as `host.docker.internal` — so allow that Host:

   ```bash
   DASHBOARD_ALLOWED_HOSTS=host.docker.internal npm start
   ```

   > Without this you'll see the Prometheus target stuck **DOWN** with
   > `403 EBADHOST`. If you also set `DASHBOARD_TOKEN`, see [Auth](#auth) below.

2. **Bring up the stack:**

   ```bash
   cd monitoring
   docker compose up -d
   ```

3. **Open Grafana** at <http://localhost:3000> (login `admin` / `admin`). The
   **CCAM — Overview** dashboard is already there — no import step. Prometheus is
   at <http://localhost:9090> (check `Status → Targets`: `ccam` should be **UP**).

Tear down with `docker compose down` (add `-v` to also drop the stored metrics).

## What's on the dashboard

| Panel | Query |
| --- | --- |
| Active sessions / Working agents / Realtime clients / Enabled remote sources | `ccam_sessions{status="active"}`, `ccam_agents{status="working"}`, `ccam_websocket_clients`, `ccam_remote_sources{enabled="true"}` |
| Sessions by status | `ccam_sessions` |
| Agents by status | `ccam_agents` |
| Event throughput | `rate(ccam_events_total[5m])` |
| Token usage rate by kind | `rate(ccam_tokens_total[5m])` |
| Uptime / Memory / Build info | `ccam_process_uptime_seconds`, `ccam_process_resident_memory_bytes`, `ccam_build_info` |

See [`docs/API.md` → Metrics](../docs/API.md#metrics) for the full metric list.

## Configuration

- **Different host/port.** If the dashboard isn't on `host.docker.internal:4820`,
  edit the `targets` in [`prometheus/prometheus.yml`](./prometheus/prometheus.yml)
  and set `DASHBOARD_ALLOWED_HOSTS` on the server to whatever `Host` Prometheus
  sends.
- **<a id="auth"></a>Auth (`DASHBOARD_TOKEN`).** If the server requires a token,
  uncomment the `authorization` block in `prometheus/prometheus.yml` and set
  `credentials` to your `DASHBOARD_TOKEN`. (The `DASHBOARD_ALLOWED_HOSTS` step is
  still required — the Host guard runs independently of the token.)
- **Scrape interval** lives in `prometheus/prometheus.yml` (`global.scrape_interval`).
- **Grafana admin password** is set via `GF_SECURITY_ADMIN_PASSWORD` in
  `docker-compose.yml` — change it before exposing Grafana anywhere.

## Security note

`/api/metrics` exposes aggregate operational counts (session/agent tallies, event
and token totals, uptime) — no prompts, transcripts, costs, or secrets. It sits
behind the same loopback/Host guard and optional `DASHBOARD_TOKEN` as the rest of
the API; scraping is only possible once you explicitly allow the scraper's Host
(and token, if set). Keep Grafana/Prometheus on a trusted network or behind your
own reverse proxy.
