# Getting Started

## Prerequisites

!!! info "What You Need"
    - A modern web browser (Chrome, Firefox, or Edge)
    - `curl` and `jq` installed for lab exercises
    - An OpenTelemetry Collector or SDK for hands-on ingestion labs
    - Training environment credentials provided by your instructor

---

## Accessing the Portal

The xScaler portal is your central control plane for managing tenants, API keys, agents, and usage.

**Production URL:** `https://portal.xscalerlabs.com`

<div class="screenshot-placeholder">
[Screenshot: xScaler portal login page]
</div>

Your instructor will provide login credentials for the shared training organisation. Once logged in you will see the organisation dashboard with your tenants, usage metrics, and agent fleet.

---

## Production Endpoints

xScaler uses a two-tier architecture. The **control plane** is global; **edge endpoints** are regional and provided by your instructor.

### Control Plane

| Service | URL |
|---|---|
| Portal | `https://portal.xscalerlabs.com` |
| Agent API (OpAMP) | `wss://agents.xscalerlabs.com/v1/opamp` |

### Edge Data Plane (per-region)

Your instructor will give you the edge hostname for today's training (`<edge>` below).

| Signal | OTLP HTTP | OTLP gRPC |
|---|---|---|
| Metrics | `https://<edge>.m.xscalerlabs.com/otlp/v1/metrics` | — |
| Logs | `https://<edge>.l.xscalerlabs.com/otlp/v1/logs` | — |
| Traces | `https://<edge>.t.xscalerlabs.com/otlp/v1/traces` | `<edge>.t.xscalerlabs.com:4317` |

!!! tip "Example: EU West 1"
    If your instructor assigns edge `euw1-01`, your logs endpoint is:
    `https://euw1-01.l.xscalerlabs.com/otlp/v1/logs`

---

## Lab Environment Variables

Set these shell variables once at the start of each lab session. Replace `euw1-01` with your assigned edge.

```bash
export PORTAL_BASE="https://portal.xscalerlabs.com"
export EDGE="euw1-01"
export METRICS_BASE="https://${EDGE}.m.xscalerlabs.com"
export LOGS_BASE="https://${EDGE}.l.xscalerlabs.com"
export TRACES_BASE="https://${EDGE}.t.xscalerlabs.com"
export GRAFANA_URL="https://<your-org-slug>.g.xscalerlabs.com"
```

Obtain a JWT token for portal API calls:

```bash
export JWT_TOKEN=$(curl -s -X POST "$PORTAL_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}' | jq -r '.token')

echo "Token set: ${JWT_TOKEN:0:20}..."
```

!!! warning "Token Expiry"
    JWT tokens expire after **30 minutes**. Re-run the login command if you get a `401` response.

---

## Accessing Grafana

Each organisation has a dedicated Grafana instance provisioned automatically.

**URL pattern:** `https://<your-org-slug>.g.xscalerlabs.com`

Your instructor will supply the exact URL and credentials for the training organisation.

<div class="screenshot-placeholder">
[Screenshot: Grafana home dashboard showing pre-configured datasources]
</div>

The training Grafana has three datasources pre-configured:
- **xMetrics** — Prometheus-compatible metrics
- **xLogs** — LogQL log queries
- **xTraces** — TraceQL distributed traces

---

## Quick Validation

Once your environment variables are set, verify each signal is reachable:

```bash
# Validate your API key by querying the portal
curl -s "$PORTAL_BASE/api/portal/org/me" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .name

# Check metrics endpoint health
curl -s "$METRICS_BASE/ready"

# Check logs endpoint health
curl -s "$LOGS_BASE/ready"

# Check traces endpoint health
curl -s "$TRACES_BASE/ready"
```

Expected: each health check returns `ready`.

---

## Key Takeaways

!!! success "Checkpoint"
    - The portal lives at `https://portal.xscalerlabs.com`
    - Edge endpoints are region-scoped: `<edge>.m/l/t.xscalerlabs.com`
    - Set the five environment variables before starting any lab
    - JWT tokens expire in 30 minutes — re-authenticate when they do
    - Your Grafana is at `https://<org-slug>.g.xscalerlabs.com`

---

*← Previous: [Home](index.md)*  
*Next: [Session 1 — Overview →](session-1/overview.md)*
