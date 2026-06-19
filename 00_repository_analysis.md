# Repository Analysis Report
## xScaler Observability Platform
**Analysis Date:** 2026-06-18  
**Analyst:** Senior Technical Trainer / Solution Architect  
**Repository Path:** `/Users/pathum.fernando/Projects/xscaler/xscaler`

---

## 1. Executive Summary

The xScaler Observability Platform is a production-grade, multi-tenant SaaS platform for metrics, logs, and traces observability. It is deployed across a **control plane cluster** and multiple **regional edge data-plane clusters**, orchestrated via ArgoCD GitOps. The platform is built on open-source Grafana LGTM-stack components (Mimir, Loki, Tempo) wrapped with proprietary authentication, billing, and agent management layers.

---

## 2. Files Analyzed

| File / Path | Purpose |
|---|---|
| `README.md` | Local dev quickstart, service map, Stripe billing, auth flows |
| `docs/ARCHITECTURE.md` | Canonical architecture reference (17 sections, ~715 lines) |
| `solution.md` | Component breakdown and end-to-end flows |
| `docker-compose.yml` | Complete local stack definition (25+ services) |
| `deploy/envoy/envoy.yaml` | Envoy gateway configuration (4 listeners, 13 clusters) |
| `deploy/mimir/mimir.yaml` | Mimir monolith config (local dev) |
| `deploy/loki/loki.yaml` | Loki monolith config (local dev) |
| `deploy/tempo/tempo.yaml` | Tempo config (local dev) |
| `deploy/otel/otel-collector.yaml` | OTel Collector scrape + export config |
| `deploy/agents/agent-1.supervisor.yaml` | OpAMP supervisor config |
| `deploy/agents/agent-2.supervisor.yaml` | OpAMP supervisor config (second agent) |
| `deploy/observability/grafana/provisioning/datasources/datasource.yml` | Grafana datasource provisioning |
| `deploy/observability/prometheus.yml` | Prometheus scrape + remote_write config |
| `agent-api/cmd/agent-api/main.go` | OpAMP server entry point |
| `agent-api/internal/opampserver/server.go` | OpAMP protocol handler (enrollment, push, delivery) |
| `agent-api/migrations/001_agent_schema.up.sql` | Agent management DB schema |
| `agent-api/migrations/002_agent_config_secrets.up.sql` | Agent config secrets schema |
| `portal-api/cmd/portal-api/main.go` | Control plane API entry point (150+ lines read) |
| `scripts/agents/seed-local.sql` | Local dev agent seed data |
| `scripts/k3s/bootstrap.sh` | Local k3s bootstrap for managed Grafana |
| `charts/portal-xscaler/values.yaml` | Portal Helm chart configuration |
| `charts/edge-xscaler/templates/otel-collector-configmap.yaml` | Edge OTel collector Helm template |
| `docs/grafana-usage-billing-setup.md` | Managed Grafana billing guide |
| `docs/ARCHITECTURE.md` | Full architecture specification |

---

## 3. Architecture Findings

### 3.1 Deployment Topology

```
Control Plane (System Cluster)
├── portal-api          Go REST API — tenant/user/key management
├── portal-web          Next.js SPA — UI
├── agent-api           Go OpAMP server — OTel agent management
├── mimir-sync          Go daemon — Mimir usage aggregation → Postgres
├── system-mimir        Grafana Mimir — system metrics storage
├── provisiond          Managed Grafana provisioner
├── postgres            PostgreSQL — control plane state
└── ArgoCD              GitOps controller

Edge Clusters (Per-Region, e.g. euw1-01)
├── Envoy               API gateway (4 listeners: metrics/logs/traces HTTP/gRPC)
├── proxy-auth (×3)     ext_authz token validator (metrics/logs/traces instances)
├── Mimir               Grafana Mimir (metrics backend)
├── Loki                Grafana Loki (logs backend)
├── Tempo               Grafana Tempo (traces backend)
└── OTel Collector      Edge observability (scrapes → system-mimir)
```

### 3.2 Service Roles

| Service | Language | Port(s) | Role |
|---|---|---|---|
| `portal-api` | Go | 8081 | Control plane REST API |
| `portal-web` | Next.js/TypeScript | 3000 | Web UI (SPA) |
| `agent-api` | Go | 8082 | OpAMP server for OTel agent management |
| `proxy-auth` | Go | 9001 (gRPC), 9002 (HTTP) | API key validation, rate limiting |
| `envoy` | C++ (Envoy Proxy) | 8080/8181/8282/4317 | Edge gateway + ext_authz |
| `mimir-sync` | Go | — | Polls Mimir → writes Postgres usage |
| `client-mimir` | Go (Grafana Mimir) | 9009 | Tenant metrics storage |
| `system-mimir` | Go (Grafana Mimir) | 9009/9010 | System monitoring metrics |
| `client-loki` | Go (Grafana Loki) | 3100 | Tenant logs storage |
| `tempo` | Go (Grafana Tempo) | 3200/4317/4318/9095 | Tenant traces storage |
| `otel-collector` | Go (OTel Contrib) | 4317/4318 | Metrics/traces scraping |
| `postgres` | PostgreSQL | 5432 | Primary control plane DB |
| `grafana` | Grafana OSS | 3001 | Dev dashboards |
| `provisiond` | Go | — | Managed Grafana lifecycle management |

### 3.3 Authentication Model

**Control Plane (User Auth):**
- Amazon Cognito manages user identity (SSO/OIDC)
- `portal-web` → Cognito → exchanges with `portal-api` for xScaler JWT
- JWT signed with `JWT_SIGNING_KEY`, TTL 30m (configurable)
- JWT stored in `HttpOnly` cookie in browser
- Service-to-service: `PORTAL_SERVICE_TOKEN` (long-lived bearer)

**Data Plane (Agent/API Key Auth):**
- Users create API keys via portal-api
- Key stored as SHA-256 hash in `api_keys` table
- Agent sends `Authorization: Bearer <token>` + `X-Scope-OrgID: <tenant_id>`
- Envoy calls proxy-auth gRPC `Check()` for every request
- proxy-auth caches token snapshots for 10 seconds
- If authorized: injects `X-Scope-OrgID`, `X-Xscalor-Tenant`, `X-Xscalor-Plan` headers

**Agent Management (OpAMP Auth):**
- Two token types: enrollment tokens (`xse_` prefix) and agent keys (`xag_` prefix)
- All tokens stored as SHA-256 hashes
- OpAMP WebSocket at `ws(s)://agents.<domain>/v1/opamp`

### 3.4 Multi-Tenancy Implementation

- **Isolation Key:** `X-Scope-OrgID` header propagated through entire data path
- **Tenant ID Format:** `xs_<orgslug>_<8-char-lower-base32>` (e.g. `xs_trustpay_ab3cd4ef`)
- **Org ID Format:** `xs_org_<32-lower-hex>`
- **Database:** `organizations` → `tenants` → `api_keys` hierarchy
- **Cluster Assignment:** portal-api assigns tenant to edge cluster with available capacity
- **Mimir/Loki/Tempo:** all run with `multitenancy_enabled: true`; `X-Scope-OrgID` is the org key

### 3.5 Data Pipelines

**Metrics Pipeline:**
```
App → OTel Collector / Prometheus remote_write
    → Envoy :8080
    → proxy-auth (validation + rate limiting)
    → Mimir Distributor → Ingesters → S3
    ← Mimir Query Frontend ← Querier ← Store Gateway ← S3
```

**Logs Pipeline:**
```
App → OTel Collector / Loki push
    → Envoy :8181
    → proxy-auth-logs (validation)
    → Loki Distributor → Ingesters → S3
    ← Loki Query Frontend ← Querier ← S3
```

**Traces Pipeline:**
```
App → OTel Collector (OTLP)
    → Envoy :8282 (HTTP) / :4317 (gRPC)
    → proxy-auth-traces (validation)
    → Tempo Distributor → Ingesters → S3
    ← Tempo Query Frontend ← Querier ← S3
```

### 3.6 Agent Management (OpAMP)

- **Protocol:** Open Agent Management Protocol (OpAMP) over WebSocket/HTTP
- **Server:** `agent-api` service (port 8082)
- **Client:** `opamp-supervisor` managing `otelcol-contrib` binary
- **Enrollment Flow:**
  1. Agent connects with enrollment token (`xse_` prefix)
  2. Server upserts agent record, mints per-agent key (`xag_` prefix)
  3. Agent reconnects with per-agent key
  4. Server sends `RemoteConfig` (OTel collector YAML)
- **Config Management:** Templates + label-based assignments in Postgres
- **Config Delivery Tracking:** `agent_config_deliveries` table tracks `offered/applying/applied/failed`
- **Secrets:** `${secret:NAME}` references in templates resolved via AWS KMS envelope encryption

### 3.7 Configuration Management

- **Config Templates:** Named YAML documents stored with revision history in `agent_config_templates` + `agent_config_template_revisions`
- **Assignments:** Label-selector-based (`matchLabels`, `matchExpressions`) binding of templates to agents
- **Push Mechanism:** PostgreSQL `LISTEN/NOTIFY` on `agent_config_changed` channel triggers real-time push to connected agents
- **Rollback:** Full revision history; assign an older revision to roll back
- **Secrets Injection:** `${secret:NAME}` syntax resolved at delivery time, never persisted in plaintext

### 3.8 Grafana Integration

**Three deployment modes:**
1. **Local Dev Grafana** — Docker Compose at `:3001`, preconfigured datasources
2. **Self-Hosted Grafana** — Customer manages their own Grafana instance
3. **xScaler Managed Grafana** — Per-org Grafana provisioned by `provisiond` on EKS, billed per pod-hour via Stripe

**Datasource Configuration:**
- Metrics: Prometheus/Mimir datasource pointing to `euw1-01.m.xscalerlabs.com`
- Logs: Loki datasource pointing to `euw1-01.l.xscalerlabs.com`
- Traces: Tempo datasource pointing to `euw1-01.t.xscalerlabs.com`
- All require `X-Scope-OrgID` header (tenant_id) for multi-tenant isolation

### 3.9 Billing Model

| Plan | Base/mo | Metrics (included) | Logs (included) | Retention |
|---|---|---|---|---|
| Free | $0 | 20k active series (hard cap) | 50 GB/mo (hard cap) | 30d |
| Scale | $19 | 20k included, metered above | 50 GB included, metered above | 90d |
| Enterprise | Custom | Custom | Custom | Custom |

- Scale metering: `$0.001428/series-month` (p95 of billing period) + `$0.25/GB-logs`
- Managed Grafana: `$0.04/pod-hour` (min 2 replicas)
- CronJob `usage-reporter` publishes Stripe meter events daily at 02:15 UTC

---

## 4. Deployment Findings

### 4.1 Helm Charts

| Chart | Purpose |
|---|---|
| `portal-xscaler` | Control plane: portal-api, portal-web, agent-api, usage-reporter CronJobs |
| `edge-xscaler` | Metrics edge: Envoy + proxy-auth + Mimir + OTel collector |
| `edge-loki-xscaler` | Logs edge: Envoy + proxy-auth-logs + Loki |
| `edge-tempo-xscaler` | Traces edge: Envoy + proxy-auth-traces + Tempo |
| `system-xscaler` | System monitoring: system-Mimir + mimir-sync |
| `provisiond` | Managed Grafana provisioner |

### 4.2 GitOps (ArgoCD)

- ArgoCD apps defined in `/gitops/apps/edge-euw1-01/`
- Values overrides in `/gitops/values/prod/edge-euw1-01/`
- Edge clusters identified by cluster names (e.g. `euw1-01`)

### 4.3 Container Images (ECR)

- `483075907540.dkr.ecr.eu-west-1.amazonaws.com/xscaler/portal-api:X.Y.Z`
- `483075907540.dkr.ecr.eu-west-1.amazonaws.com/xscaler/portal-web:X.Y.Z`
- `483075907540.dkr.ecr.eu-west-1.amazonaws.com/xscaler/proxy-auth:X.Y.Z`
- `483075907540.dkr.ecr.eu-west-1.amazonaws.com/xscaler/mimir-sync:X.Y.Z`
- `483075907540.dkr.ecr.eu-west-1.amazonaws.com/xscaler/agent-api:X.Y.Z`

---

## 5. Configuration Findings

### 5.1 OTel Collector Config (Local Dev)

Located at `deploy/otel/otel-collector.yaml`:
- **Receivers:** Prometheus (scrapes Mimir, Envoy, proxy-auth, Loki, Tempo) + OTLP gRPC/HTTP
- **Processors:** memory_limiter (256 MiB) + batch (5s / 1024 events)
- **Exporters:** `prometheusremotewrite` → system-mimir, `otlphttp/tempo` → Tempo
- **Pipelines:** metrics (prometheus → batch → PRW) + traces (otlp → batch → Tempo)

### 5.2 Envoy Configuration (Local Dev)

Located at `deploy/envoy/envoy.yaml`:
- **4 listeners:**
  - `:8080` — Metrics (Mimir) with `proxy-auth` ext_authz
  - `:8181` — Logs (Loki) with `proxy-auth-logs` ext_authz
  - `:8282` — Traces HTTP (Tempo) with `proxy-auth-traces` ext_authz
  - `:4317` — Traces gRPC (Tempo) with `proxy-auth-traces` ext_authz
- Lua filter enforces single `X-Scope-OrgID` per request
- `ext_authz` timeout: 250ms (failure_mode_allow: false = fail-closed)

### 5.3 Mimir Configuration

Located at `deploy/mimir/mimir.yaml`:
- `multitenancy_enabled: true`
- Local filesystem backend (dev), S3 in production
- Ingestion limits: 100,000 samples/sec, 10M series/user
- Replication factor: 1 (dev), 3 (prod)

### 5.4 Loki Configuration

Located at `deploy/loki/loki.yaml`:
- `auth_enabled: true`
- TSDB schema v13, filesystem backend (dev), S3 in production
- Retention: 168h local dev, 720h (30d) prod default
- Ingestion: 10 MB/s rate, 20 MB burst

### 5.5 Tempo Configuration

Located at `deploy/tempo/tempo.yaml`:
- `multitenancy_enabled: true`
- OTLP receivers on gRPC `:4317` and HTTP `:4318`
- Block retention: 1440h (60d) global
- Ingestion: 15 MB/s rate, 20 MB burst; max trace 5 MB

---

## 6. Gaps Found

| Gap | Impact | Notes |
|---|---|---|
| No Ansible playbooks found in repository | Training adaptation needed | Repository uses OpAMP/agent-api for config management instead of Ansible; deploy instructions use Docker/Helm/kubectl |
| No explicit Grafana alerting rule files in repository | Training will use Grafana UI instructions | Alert rules are configured via Grafana UI, not committed to this repo |
| Managed Grafana provisioner code (provisiond) analyzed at high level | Internal provisioning details not deep-dived | Sufficient detail from docs/ARCHITECTURE.md for training purposes |
| Terraform files are in separate `terraform-aws/` repo | Not analyzed | Referenced in ARCHITECTURE.md; training will reference EKS, S3, RDS infrastructure |

---

## 7. Key Insights for Training

1. **OpAMP is the agent management protocol** — not Ansible. The platform uses a WebSocket-based protocol with the `otelcol-contrib` collector managed by the `opamp-supervisor`. Configuration is push-based from portal-api through agent-api.

2. **The `X-Scope-OrgID` header is the multi-tenancy key** — every component in the data path uses this header for tenant isolation. Training must emphasize this.

3. **Three separate Envoy listeners per edge cluster** — metrics (:8080), logs (:8181), traces (:8282/:4317). Each has its own proxy-auth instance configured for its signal type.

4. **Dashboard data never comes directly from Mimir** — `mimir-sync` polls Mimir every 60s and writes Postgres rollup tables. Portal reads from Postgres. This decoupling is architecturally important.

5. **Config delivery is tracked end-to-end** — `agent_config_deliveries` table records `offered → applying → applied/failed` lifecycle with the config hash, enabling rollback validation.

6. **Secrets in agent configs use `${secret:NAME}` syntax** — resolved by agent-api at delivery time via AWS KMS, never stored in plaintext.
