# xScaler Observability Platform — Architecture Overview
## Comprehensive Technical Reference for Training

---

## 1. Platform Overview

xScaler is a **multi-tenant SaaS Observability Platform** that provides Metrics, Logs, and Traces (MLT) as a managed service. It is built on top of the Grafana LGTM stack (Loki, Grafana, Tempo, Mimir) and wraps it with proprietary multi-tenancy, authentication, billing, and agent management layers.

### Key Design Principles

1. **Multi-Tenant Isolation** — `X-Scope-OrgID` header is the single source of truth for tenant scoping in all backend systems (Mimir, Loki, Tempo).
2. **Decoupled Data Planes** — Edge clusters are independent; the control plane coordinates but does not inline data.
3. **Mimir-Symmetric API Paths** — Customer-facing URLs (`/api/v1/push`, `/api/v1/query`, etc.) are identical on metrics and logs hosts; backend identity is the hostname, not the path.
4. **Cache-First Auth** — proxy-auth caches token snapshots for 10s to minimize control-plane load; stale-refresh ensures consistency.
5. **Billing as Meters** — Stripe Meter API (not invoices) enables real-time usage-based pricing.
6. **OpAMP for Agent Management** — Open Agent Management Protocol drives zero-touch OTel collector configuration distribution.

---

## 2. Platform Components

### 2.1 Control Plane Services

#### portal-api (Go, port 8081)
The core REST API serving the portal UI. Handles:
- User authentication (Cognito OIDC exchange → JWT issuance)
- Organization and user management (CRUD)
- Tenant lifecycle management (create, list, update, delete)
- API key management (create, rotate, revoke)
- Billing integration (Stripe webhook, subscription management)
- Usage dashboard data (reads from Postgres rollup tables)
- Managed Grafana desired-state endpoint
- Internal proxy-auth snapshot endpoint (token validation)
- Agent management proxying (forwards to agent-api)

**Key code path:** `portal-api/cmd/portal-api/main.go` → repositories → services → handlers → HTTP transport

#### portal-web (Next.js/TypeScript, port 3000)
Browser-based control plane UI. Key pages:
- `/login`, `/signup`, `/onboarding/organization` — authentication
- `/metrics/tenants`, `/logs/tenants`, `/traces/tenants` — signal management
- `/agents` — OpAMP agent management (list, config, enrollment)
- `/agents/config` — config template editor
- `/agents/enrollment` — enrollment token management
- `/billing` — Stripe billing portal
- `/settings/*` — org settings, members, notifications, managed Grafana
- `/settings/developer` — API key management
- `/activity` — audit log

**Auth flow:** Cognito login → `portal-web` exchanges Cognito token with `portal-api` at `POST /auth/cognito/exchange` → stores short-lived JWT in HttpOnly cookie.

#### agent-api (Go, port 8082)
OpAMP server for OTel agent lifecycle management:
- Accepts WebSocket (`GET /v1/opamp`) and HTTP (`POST /v1/opamp`) connections
- Authenticates agents via enrollment tokens (`xse_` prefix) or agent keys (`xag_` prefix)
- Pushes `RemoteConfig` (OTel collector YAML) based on label-selector assignments
- Listens to Postgres `NOTIFY` on `agent_config_changed` channel for real-time pushes
- Tracks config delivery status (`offered → applying → applied/failed`)
- Resolves `${secret:NAME}` references via AWS KMS before delivery
- Sweeps stale agents (offline detection) every 30s

#### mimir-sync (Go, background daemon)
Aggregates per-tenant Mimir usage into Postgres:
- Polls `system-mimir` Prometheus API every 60 seconds
- Queries `active_series`, `sample_rate`, storage bytes per tenant
- Writes to `tenant_usage` and `dashboard_tenant_hourly/minute` tables
- Triggers email alerts when a tenant exceeds 80% of plan limit
- Provides the data source for portal-web usage dashboards

#### system-mimir (Grafana Mimir)
Internal-only Mimir for platform observability:
- Receives metrics from edge OTel collectors (via remote_write)
- Single tenant: `system-monitoring`
- Stores Mimir internal metrics (distributor latency, ingestion rate, etc.)
- Queried by `mimir-sync` for per-tenant usage

#### provisiond (Go, Kubernetes Job)
Managed Grafana provisioner running in each edge cluster:
- Polls `portal-api` at `GET /internal/managed-grafana/desired` every N seconds
- Creates per-org Grafana Helm releases on the edge EKS cluster
- Creates per-org PostgreSQL database and role on shared RDS instance
- Posts phase updates to `portal-api` at `POST /internal/managed-grafana/phase`

### 2.2 Edge Data Plane Services (Per Region)

#### Envoy Gateway
The public-facing API gateway with 4 listeners:

| Port | Signal | Backend |
|---|---|---|
| 8080 | Metrics | Mimir Distributor / Query Frontend |
| 8181 | Logs | Loki Distributor / Query Frontend |
| 8282 | Traces (HTTP) | Tempo Distributor / Query Frontend |
| 4317 | Traces (gRPC) | Tempo Distributor |

**Key behaviors:**
- Lua filter enforces single `X-Scope-OrgID` per request (comma = 400)
- `ext_authz` gRPC filter calls proxy-auth before routing (timeout: 250ms, fail-closed)
- Path rewriting: `/api/v1/push` → `/prometheus/api/v1/push` (for Mimir)
- Alertmanager and Ruler routes return 503 (not enabled)

#### proxy-auth (Go, gRPC :9001 / HTTP :9002)
Per-signal token validator and rate limiter. One deployment per signal type:

| Instance | `AUTH_BACKEND_KIND` | Allowed paths |
|---|---|---|
| proxy-auth | `metrics` | `/api/v1/{push,query,query_range,labels,label,series,metadata,status,read}` |
| proxy-auth-logs | `logs` | `/api/v1/*`, `/loki/api/v1/*`, `/otlp/v1/logs` |
| proxy-auth-traces | `traces` | `/otlp/v1/traces`, `/api/search`, `/api/traces/*`, `/api/echo` |

**Validation flow:**
1. Extract `Authorization: Bearer <token>` header
2. SHA-256 hash the token
3. Cache lookup (10s TTL, 2s stale-before-refresh)
4. On miss: `GET /internal/proxy-auth/snapshot?token_hash=<sha256>&tenant_hint=<id>`
5. Inject headers if authorized

**Rate limiting (when enabled):**
- Metrics: `max_active_series` + `min_scrape_interval_sec` from plan
- Logs: `max_logs_bytes_per_sec` from plan
- Billing soft-lock: `BillingAccessMode == "soft_locked"` → 429

#### Grafana Mimir (edge instance)
Multi-tenant metrics storage:
- `multitenancy_enabled: true` (auth via `X-Scope-OrgID`)
- S3 backend for block storage
- Components: Distributor, Ingester, Query-Frontend, Querier, Compactor, Store-Gateway

#### Grafana Loki (edge instance)
Multi-tenant log storage:
- `auth_enabled: true`
- TSDB v13 schema with S3 backend
- Retention: 30d (free) to 90d (scale) to custom (enterprise)
- Components: Distributor, Ingester, Query-Frontend, Querier, Query-Scheduler, Compactor, Index-Gateway

#### Grafana Tempo (edge instance)
Multi-tenant distributed traces storage:
- `multitenancy_enabled: true`
- OTLP gRPC (:4317) and HTTP (:4318) receivers
- S3 backend for block storage
- Block retention: up to 60d

#### OTel Collector (edge monitoring)
Scrapes edge cluster internals and remote-writes to system-mimir:
- Scrapes: Mimir distributor/ingester pods, proxy-auth metrics
- Attaches `xscaler_cluster` label (from namespace)
- Remote-writes to `system-mimir` under `system-monitoring` tenant

---

## 3. Database Schema

### 3.1 Core Tables (portal-api-owned)

```
users                    id, email, cognito_sub, auth_provider
organizations            id, public_id, name, owner_user_id, plan_id
organization_members     (org_id, user_id), role (owner/admin/member)
tenants                  id, org_id, cluster_id, region, status,
                         metrics_host, logs_host, traces_host,
                         display_name, environment
clusters                 id, name, region, metrics_host, logs_host, traces_host,
                         max_active_series, status
api_keys                 id, tenant_id, name, key_hash(SHA256), last_used_at, status
plans                    id, name(free/scale/enterprise), max_active_series,
                         max_samples_per_sec, retention_days,
                         max_logs_bytes_monthly, logs_retention_days, usage_based
plan_stripe_prices       id, plan_id, stripe_price_id, event_name, role(primary/addon)
tenant_usage             tenant_id, active_series, storage_bytes,
                         logs_bytes_per_sec, logs_bytes_stored
dashboard_tenant_hourly  org_id, tenant_id, timestamp, dpm_avg, dpl_avg,
                         logs_bytes_per_sec_avg, logs_bytes_stored_avg
organization_billing     org_id, stripe_customer_id, current_period_start_at,
                         last_usage_reported
managed_grafanas         id, org_id, phase, replicas, billing_started_at
managed_grafana_billing  (grafana_id, hour_bucket), value(replicas) [dedup key]
```

### 3.2 Agent Management Tables (agent-api-owned)

```
agent_enrollment_tokens  id, org_id, tenant_id, name, token_hash(SHA256),
                         default_labels(jsonb), status, max_uses, use_count
agents                   id, org_id, instance_uid, agent_type, version, os, hostname,
                         labels(jsonb), status, health(jsonb),
                         last_remote_config_hash, effective_config, enrolled_via
agent_keys               id, agent_id, key_hash(SHA256), status
agent_config_templates   id, org_id, name, description, content_type
agent_config_template_revisions  id, template_id, revision, body, config_hash, note
agent_config_assignments id, org_id, template_id, label_selector(jsonb), priority, enabled
agent_config_deliveries  id, agent_id, config_hash, status(offered/applying/applied/failed),
                         error_message, offered_at, applied_at
agent_config_secrets     id, org_id, name, description, ciphertext(bytea),
                         enc_context_org_id, enc_context_name
```

---

## 4. API Reference

### 4.1 Control Plane API (portal-api :8081)

#### Authentication
```
POST /auth/signup               Create org + user (local auth)
POST /auth/login                Login (local auth)
POST /auth/cognito/exchange     Exchange Cognito token for xScaler JWT
```

#### Tenant Management
```
GET  /tenants                   List org tenants
POST /tenants                   Create tenant {display_name, environment, region}
GET  /tenants/{id}              Get tenant details
PATCH /tenants/{id}             Update tenant {display_name, environment}
```

#### API Key Management
```
GET  /tenants/{id}/keys         List API keys for tenant
POST /tenants/{id}/keys         Create API key {name}
DELETE /tenants/{id}/keys/{kid} Revoke API key
```

#### Dashboard
```
GET /api/portal/tenants/{id}/dashboard/summary   Usage summary (from Postgres rollups)
GET /api/portal/dashboard/org/summary            Org-level usage
```

#### Internal (service-to-service)
```
GET /internal/proxy-auth/snapshot?token_hash=&tenant_hint=   Token validation (proxy-auth)
GET /internal/managed-grafana/desired                          Desired Grafana state (provisiond)
POST /internal/managed-grafana/phase                           Phase update (provisiond)
```

### 4.2 Data Plane API (via Envoy)

#### Metrics (Mimir-compatible)
```
POST /api/v1/push               Prometheus remote_write ingestion
GET  /api/v1/query              Instant PromQL query
GET  /api/v1/query_range        Range PromQL query
GET  /api/v1/labels             Label names
GET  /api/v1/label/{name}/values Label values
GET  /api/v1/series             Series selector
GET  /api/v1/metadata           Metric metadata
POST /otlp/v1/metrics           OTLP metrics push
```

#### Logs (Loki-compatible)
```
POST /api/v1/push               Loki log push (JSON/Protobuf)
GET  /api/v1/query              Instant LogQL query
GET  /api/v1/query_range        Range LogQL query
GET  /api/v1/labels             Label names
GET  /api/v1/series             Series selector
POST /otlp/v1/logs              OTLP logs push
GET  /loki/api/v1/*             Direct Loki passthrough (for Grafana datasource)
```

#### Traces (Tempo-compatible)
```
POST /otlp/v1/traces            OTLP HTTP traces push
POST /v1/traces                 Native Tempo traces push (gRPC on :4317)
GET  /api/search                Search traces
GET  /api/traces/{traceId}      Get trace by ID
GET  /api/v2/search             Search v2
```

### 4.3 Agent API (agent-api :8082)

```
GET/POST /v1/opamp              OpAMP WebSocket/HTTP endpoint
GET /healthz                    Liveness probe
GET /readyz                     Readiness probe (DB ping)
```

---

## 5. Configuration Reference

### 5.1 OTel Collector Config Structure

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
  prometheus:
    config:
      scrape_configs:
        - job_name: myapp
          static_configs:
            - targets: ["localhost:8080"]

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 256
  batch:
    timeout: 5s
    send_batch_size: 1024

exporters:
  prometheusremotewrite:
    endpoint: https://euw1-01.m.xscalerlabs.com/api/v1/push
    headers:
      Authorization: Bearer ${XSCALER_API_KEY}
      X-Scope-OrgID: ${XSCALER_TENANT_ID}
  otlphttp/loki:
    endpoint: https://euw1-01.l.xscalerlabs.com
    headers:
      Authorization: Bearer ${XSCALER_API_KEY}
      X-Scope-OrgID: ${XSCALER_TENANT_ID}
  otlphttp/tempo:
    endpoint: https://euw1-01.t.xscalerlabs.com
    headers:
      Authorization: Bearer ${XSCALER_API_KEY}
      X-Scope-OrgID: ${XSCALER_TENANT_ID}

service:
  pipelines:
    metrics:
      receivers: [prometheus, otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheusremotewrite]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/loki]
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/tempo]
```

### 5.2 OpAMP Supervisor Config

```yaml
server:
  endpoint: wss://agents.xscalerlabs.com/v1/opamp
  headers:
    Authorization: "Bearer xse_<enrollment_token>"

capabilities:
  accepts_remote_config: true
  reports_effective_config: true
  reports_remote_config: true
  reports_health: true

agent:
  executable: /usr/local/bin/otelcol-contrib
  description:
    identifying_attributes:
      service.name: io.opentelemetry.collector
    non_identifying_attributes:
      environment: production
      team: platform

storage:
  directory: /tmp/supervisor
```

### 5.3 Grafana Datasource Configuration

**Metrics (Prometheus/Mimir):**
```yaml
apiVersion: 1
datasources:
  - name: xScaler Metrics
    type: prometheus
    url: https://euw1-01.m.xscalerlabs.com
    jsonData:
      httpHeaderName1: Authorization
      httpHeaderName2: X-Scope-OrgID
    secureJsonData:
      httpHeaderValue1: "Bearer xag_<api_key>"
      httpHeaderValue2: "xs_acme_ab3cd4ef"
```

**Logs (Loki):**
```yaml
  - name: xScaler Logs
    type: loki
    url: https://euw1-01.l.xscalerlabs.com
    jsonData:
      httpHeaderName1: Authorization
      httpHeaderName2: X-Scope-OrgID
    secureJsonData:
      httpHeaderValue1: "Bearer xag_<api_key>"
      httpHeaderValue2: "xs_acme_ab3cd4ef"
```

**Traces (Tempo):**
```yaml
  - name: xScaler Traces
    type: tempo
    url: https://euw1-01.t.xscalerlabs.com
    jsonData:
      httpHeaderName1: Authorization
      httpHeaderName2: X-Scope-OrgID
    secureJsonData:
      httpHeaderValue1: "Bearer xag_<api_key>"
      httpHeaderValue2: "xs_acme_ab3cd4ef"
```

---

## 6. Environment Variables Reference

### portal-api
| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SIGNING_KEY` | HS256 JWT signing secret | Required |
| `TOKEN_TTL` | JWT expiry duration | 30m |
| `PORTAL_SERVICE_TOKEN` | Service-to-service bearer token | Required |
| `PORTAL_EXCHANGE_SECRET` | Cognito exchange shared secret | Required |
| `STRIPE_SECRET_KEY` | Stripe API key | Required for billing |
| `STRIPE_ENV` | `sandbox` or `live` | sandbox |
| `COGNITO_DOMAIN` | Cognito user pool domain | Required |
| `NOTIFICATION_SMTP_HOST` | SMTP host for alerts | Optional |
| `GRAFANA_SECRETS_KMS_KEY_ALIAS` | AWS KMS alias for Grafana secrets | Optional |
| `AGENT_CONFIG_SECRETS_KMS_KEY_ALIAS` | AWS KMS alias for agent config secrets | Optional |

### agent-api
| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | Shared PostgreSQL connection | Required |
| `AGENT_ADDR` | HTTP listen address | `:8082` |
| `AGENT_OPAMP_PATH` | OpAMP endpoint path | `/v1/opamp` |
| `AGENT_OPAMP_PUBLIC_URL` | Offered to agents in enrollment | Required |
| `AGENT_STALE_AFTER` | Agent offline timeout | `90s` |
| `AGENT_CONFIG_SECRETS_KMS_KEY_ALIAS` | AWS KMS alias | Optional |

### proxy-auth
| Variable | Description | Default |
|---|---|---|
| `PORTAL_API_BASE_URL` | Control plane URL | Required |
| `PORTAL_SERVICE_TOKEN` | Service token | Required |
| `AUTH_CLUSTER_NAME` | Edge cluster name | Required |
| `AUTH_BACKEND_KIND` | `metrics`, `logs`, or `traces` | `metrics` |
| `RATE_LIMIT_ENABLED` | Enable org-level rate limiting | `false` |
| `AUTH_SNAPSHOT_TTL` | Token cache TTL | `10s` |
| `AUTH_NEGATIVE_CACHE_TTL` | Negative cache TTL | `2s` |
| `USAGE_STALE_AFTER` | Max age for usage data | `15m` |

---

## 7. User Roles & Permissions

| Role | Description | Permissions |
|---|---|---|
| `owner` | Organization creator | Full admin + billing + delete org |
| `admin` | Invited administrator | Tenant management, API keys, settings, member management |
| `member` | Standard user | View tenants, view usage, create API keys for assigned tenants |

**RBAC enforcement:** portal-api middleware validates JWT role for each route. Role is embedded in JWT claims and sourced from `organization_members.role`.

---

## 8. Observability of the Platform Itself

The platform monitors itself via a dedicated `system-monitoring` tenant in `system-mimir`:

| Source | What is scraped | Where it goes |
|---|---|---|
| OTel Collector (edge) | Mimir distributor/ingester metrics + proxy-auth metrics | system-mimir, system-monitoring tenant |
| mimir-sync | Per-tenant active_series, sample_rate, storage | PostgreSQL (tenant_usage, dashboard rollups) |
| loadgen self-metrics | `loadgen_requests_total{worker,code}` | :9100/metrics |
| proxy-auth | `xscalor_ext_authz_requests_total` + duration histogram | via OTel collector |

Key PromQL queries used by mimir-sync:
```promql
# Active series per tenant (corrected for replication factor)
sum by (user) (
  (sum by (user, xscaler_cluster) (cortex_ingester_active_series))
  / on (xscaler_cluster) group_left()
  max by (xscaler_cluster) (cortex_distributor_replication_factor)
)

# Sample ingestion rate per tenant
sum by (user) (
  (sum by (user, xscaler_cluster) (rate(cortex_distributor_received_samples_total[5m])))
  and on (xscaler_cluster) max by (xscaler_cluster) (cortex_distributor_replication_factor)
)

# Storage bytes per tenant
sum by (user) (
  (sum by (user, xscaler_cluster) (cortex_ingester_tsdb_storage_blocks_bytes))
  / on (xscaler_cluster) group_left()
  max by (xscaler_cluster) (cortex_distributor_replication_factor)
)
```
