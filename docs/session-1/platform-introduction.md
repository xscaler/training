# Platform Introduction

## Learning Objectives

- [ ] Describe the xScaler platform architecture end-to-end
- [ ] Identify the role of each component in the control plane and data plane
- [ ] Explain the two-tier deployment model (system cluster + edge clusters)
- [ ] Read and interpret the platform service topology

---

## What Is xScaler?

xScaler is a **production-grade, multi-tenant SaaS observability platform**. It provides a single unified interface for collecting, storing, and visualising metrics, logs, and traces across multiple customer tenants — all in complete isolation from each other.

The platform is built on proven open-source observability backends wrapped with proprietary:
- Authentication and authorisation (`proxy-auth`, `portal-api`)
- Multi-tenant isolation (`X-Scope-OrgID` header enforcement)
- Agent management and configuration distribution (`agent-api`, OpAMP)
- Billing and usage metering (Stripe integration)

---

## Two-Tier Deployment Architecture

xScaler separates the **control plane** (global, single cluster) from the **edge data plane** (regional, one cluster per region). Telemetry from your services is always written to the closest edge cluster; the control plane handles configuration, billing, and management.

??? info "Detailed Architecture Diagram"

    ```mermaid
    graph TB
        subgraph CP["Control Plane"]
            PA[portal-api]
            PW[portal-web]
            AA[agent-api]
            PR[provisioning service]
            PG[(PostgreSQL)]
            AC[the platform deployment system]
        end

        subgraph EDGE["Edge Cluster — euw1-01 (eu-west-1)"]
            EN[Envoy Gateway]
            PXM[proxy-auth / metrics]
            PXL[proxy-auth / logs]
            PXT[proxy-auth / traces]
            MI[xMetrics]
            LO[xLogs]
            TE[xTraces]
            GR[Managed Grafana]
            OC[OTel Collector]
        end

        subgraph S3["Object Storage"]
            S3M[metrics bucket]
            S3L[logs bucket]
            S3T[traces bucket]
        end

        Users -->|HTTPS| PW
        PW -->|REST| PA
        PA <-->|Read/Write| PG
        AC -->|GitOps sync| EDGE

        Collectors -->|OTLP| EN
        EN -->|ext_authz| PXM & PXL & PXT
        PXM & PXL & PXT -->|X-Scope-OrgID| MI & LO & TE
        MI --> S3M
        LO --> S3L
        TE --> S3T
        PR -->|provision| GR
    ```

---

## Control Plane Components

### portal-api

The central control plane REST API. Every action taken in the portal UI goes through portal-api.

| Attribute | Value |
|---|---|
| Language | Go |
| Port | `:8081` |
| Auth | JWT (HS256, 30-min TTL) |
| Database | PostgreSQL |
| Responsibilities | Tenant CRUD, API key management, user auth, billing, usage dashboards |

Key service domains (from `portal-api/cmd/portal-api/main.go`):

```
activity · agentmgmt · apikey · auth · billing · dashboard
devkey · email · featureflags · logs · managedgrafana · members
notification · organization · privacy · proxyauth · publicapi
rbac · support · tenant · traces · usage
```

### portal-web

A Next.js + TypeScript single-page application (SPA) that provides the browser-based control interface.

| Attribute | Value |
|---|---|
| Framework | Next.js + TypeScript + shadcn/ui |
| Port | `:3000` |
| Auth | HttpOnly cookie containing JWT |
| Backend | Calls `portal-api:8081` |

### agent-api

The OpenTelemetry agent management server. Implements the **OpAMP** (Open Agent Management Protocol) over WebSocket to push configuration to OTel collector agents.

| Attribute | Value |
|---|---|
| Language | Go |
| Port | `:8082` (HTTP/WebSocket) |
| Protocol | OpAMP over WebSocket (`/v1/opamp`) |
| Database | PostgreSQL (NOTIFY/LISTEN on `agent_config_changed`) |
| Responsibilities | Agent enrollment, config push, delivery tracking |

### usage-sync

A background daemon that polls `platform-metrics` every 60 seconds and writes per-tenant usage metrics into PostgreSQL. This feeds the portal dashboard and billing calculations.

### PostgreSQL

The single source of truth for all control plane state: users, organisations, tenants, API keys, agent data, billing data, and usage rollups.

---

## Data Plane Components

### Envoy Gateway

The edge entry point for all telemetry data. Envoy runs **four listeners** — one per protocol:

| Listener Port | Signal | Protocol | Backend |
|---|---|---|---|
| `:8080` | Metrics | HTTP (Prometheus remote_write) | xMetrics |
| `:8181` | Logs | HTTP (xLogs push) | xLogs |
| `:8282` | Traces | HTTP (OTLP/HTTP) | xTraces |
| `:4317` | Traces | gRPC (OTLP/gRPC) | xTraces |

Every listener applies the **ext_authz** filter — all requests are authenticated before reaching the backend.

### proxy-auth

A Go service that validates API keys for every inbound request. There are three instances, one per signal type (metrics/logs/traces), each registering as a gRPC `ext_authz` server.

**What proxy-auth does on each request:**

1. Extracts `Authorization: Bearer xag_...` header
2. Hashes the key with SHA-256 and looks it up in PostgreSQL
3. Validates the key is not revoked
4. Checks rate limits (per-org, per-signal)
5. Injects the `X-Scope-OrgID` header with the tenant ID
6. Returns `OK` (200) to Envoy — which then forwards the request to the backend

### xMetrics (Tenant Metrics)

Multi-tenant long-term metrics storage. Receives Prometheus remote_write or OTLP metrics via Envoy.

- `multitenancy_enabled: true`
- Port: `:9009`
- Object storage: S3 (`metrics-storage-{region}` bucket)

### xLogs (Tenant Logs)

Multi-tenant log aggregation. Receives xLogs push API requests via Envoy.

- `auth_enabled: true`
- HTTP: `:3100`, gRPC: `:9095`
- Schema: TSDB v13
- Object storage: S3 (`logs-storage-{region}` bucket)

### xTraces (Tenant Traces)

Multi-tenant distributed trace storage. Receives OTLP gRPC/HTTP via Envoy.

- `multitenancy_enabled: true`
- HTTP: `:3200`, gRPC: `:9095`
- OTLP receivers: `:4317` (gRPC), `:4318` (HTTP)
- Object storage: S3 (`traces-storage-{region}` bucket)

---

## Multi-Tenancy: The X-Scope-OrgID Header

The entire multi-tenant isolation model relies on a single HTTP header:

```
X-Scope-OrgID: xs_payment_abc12345
```

This header is:
1. **Set by `proxy-auth`** after validating the API key — not trusted from the client
2. **Enforced by Envoy** — a Lua filter rejects any request with multiple org IDs or commas
3. **Used by xMetrics, xLogs, and xTraces** as the tenant namespace for all storage operations

!!! warning "Security Model"
    Clients never set `X-Scope-OrgID` themselves. Even if a client sends this header, the Envoy Lua filter clears it and proxy-auth overwrites it with the correct tenant ID derived from the API key lookup.

---

## Hands-On Exercise

### Exercise 1.1 — Explore the Local Stack

```bash
# List all running services
docker compose ps

# Check portal-api logs
docker compose logs portal-api --tail=30

# Verify Envoy is listening on all 4 ports
curl -s https://<edge>.m.xscalerlabs.com 2>&1 | head -5   # metrics
curl -s https://<edge>.l.xscalerlabs.com 2>&1 | head -5   # logs
curl -s https://<edge>.t.xscalerlabs.com 2>&1 | head -5   # traces HTTP
```

### Exercise 1.2 — Inspect the Architecture

```bash
# See the service dependency graph
cat docker-compose.yml | grep "depends_on" -A 5

# Check which image version is running
docker compose images
```

---

## Validation

- [ ] `docker compose ps` shows all services as `Up` or `healthy`
- [ ] `curl https://portal.xscalerlabs.com/health` returns `{"status":"ok"}`
- [ ] You can access the portal UI at `https://portal.xscalerlabs.com`
- [ ] `docker compose logs agent-api --tail=5` shows "OpAMP server listening"

---

## Troubleshooting

??? failure "portal-api keeps restarting"
    Usually a database connection issue. Check:
    ```bash
    docker compose logs portal-api | grep "error\|Error\|FATAL"
    docker compose logs postgres | tail -20
    ```

??? failure "Envoy returns 503 on port 8080"
    proxy-auth hasn't registered with Envoy yet. Wait 10 seconds and retry.
    ```bash
    docker compose logs proxy-auth --tail=20
    ```

??? failure "xTraces shows 'failed to create blocks'"
    Check block retention settings and disk space:
    ```bash
    docker compose exec tempo df -h /tmp/tempo
    ```

---

## Key Takeaways

!!! success "Session 1.1 Summary"
    - xScaler uses a **two-tier model**: control plane (system cluster) + data plane (edge clusters)
    - The **control plane** manages configuration, auth, and billing but never touches telemetry data
    - The **data plane** processes all inbound telemetry through Envoy → proxy-auth → backend
    - **Multi-tenancy** is enforced via the `X-Scope-OrgID` header, set exclusively by `proxy-auth`
    - **Four Envoy listeners** handle the four protocols: metrics (8080), logs (8181), traces HTTP (8282), traces gRPC (4317)

---

*← Previous: [Session 1 Overview](overview.md)*  
*Next: [User Management →](user-management.md)*
