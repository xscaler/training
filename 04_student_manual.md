# xScaler Observability Platform
# Student Training Manual
**2-Day Instructor-Led Training**

---

## Welcome

This manual is your reference guide throughout the 2-day xScaler training. It contains:
- Conceptual explanations for each session
- Step-by-step lab instructions with expected outputs
- Reference configurations you can use in your environment
- Troubleshooting tips

Keep this manual — it is a reference you can use after the training when deploying xScaler in your environment.

---

## Pre-Requisites

Before attending this training, you should have:
- Basic Linux command line familiarity (`curl`, `cat`, `grep`)
- Familiarity with YAML configuration files
- Basic understanding of containerised applications
- Access to the training environment (credentials provided by instructor)

Software on your training laptop:
- `curl` and `jq`
- A modern browser (Chrome or Firefox recommended)
- Text editor (VS Code recommended)

---

## Training Environment

For this training, you will use a pre-configured local xScaler stack running via Docker Compose. Your instructor will provide connection details.

**Local endpoint reference:**

| Service | URL | Credentials |
|---|---|---|
| xScaler Portal | http://localhost:3000 | See instructor |
| Portal API | http://localhost:8081 | Bearer token via login |
| Agent API (OpAMP) | ws://localhost:8082/v1/opamp | Enrollment token |
| Grafana | http://localhost:3001 | admin / admin |
| Metrics Edge (Envoy) | http://localhost:8080 | API key + tenant ID |
| Logs Edge (Envoy) | http://localhost:8181 | API key + tenant ID |
| Traces Edge (Envoy) | http://localhost:8282 | API key + tenant ID |
| Mailpit (email) | http://localhost:8025 | None |

---

# DAY 1

---

## Module 1: Platform Introduction and User Management

### 1.1 Platform Overview

The xScaler Observability Platform provides Metrics, Logs, and Traces as a managed service. It is built on the xScaler's telemetry backends (xLogs, Grafana, xTraces, xMetrics) with proprietary layers for multi-tenancy, authentication, billing, and agent management.

**[Screenshot placeholder: xScaler Portal home page showing org dashboard with metrics, logs, and traces overview cards]**

#### Key Concepts

**Control Plane vs Data Plane**

The platform has two distinct planes:

| Plane | Components | Purpose |
|---|---|---|
| Control Plane | portal-web, portal-api, agent-api | User management, tenant lifecycle, configuration |
| Data Plane | Envoy, proxy-auth, Mimir, Loki, Tempo | Metrics/logs/traces ingestion and query |

**Tenant Isolation**

Every piece of data in xScaler is namespaced by a **Tenant ID**. Your tenant ID looks like `xs_acme_ab3cd4ef`. This ID is passed as the `X-Scope-OrgID` HTTP header in every request. The backends (Mimir, Loki, Tempo) use this header to ensure you only see your own data.

**The Three Signals**

| Signal | What it is | Storage | Protocol |
|---|---|---|---|
| Metrics | Numeric time-series (CPU, requests/sec) | Grafana Mimir | Prometheus remote_write / OTLP |
| Logs | Text records of events | Grafana Loki | Loki push API / OTLP |
| Traces | Distributed request journeys | Grafana Tempo | OTLP (gRPC or HTTP) |

---

### 1.2 User Management

#### User Roles

| Role | Capabilities |
|---|---|
| `owner` | Full access including billing, org deletion |
| `admin` | Tenant management, API keys, settings, member management |
| `member` | View tenants and usage, manage own API keys |

#### Exercise 1.2.1 — Account Navigation

1. Open http://localhost:3000 in your browser
2. Log in with the credentials provided by your instructor
3. Explore the navigation menu:
   - **Metrics** → Tenants → shows all metric tenants
   - **Logs** → Tenants → shows all log tenants
   - **Agents** → lists enrolled OTel collectors
   - **Settings** → Members, notifications, Managed Grafana
   - **Billing** → plan and usage information

**[Screenshot placeholder: Portal navigation menu expanded, showing Metrics, Logs, Traces, Agents, Settings sections]**

#### Exercise 1.2.2 — View Organization Members

1. Navigate to Settings → Members
2. Observe the current members and their roles
3. Note the "Invite Member" button

**Expected output:** A list of organization members with role badges (owner/admin/member).

**[Screenshot placeholder: Settings > Members page with member list, role badges, and Invite button]**

---

### 1.3 Observability Fundamentals

#### What is Observability?

Observability is the ability to understand what is happening inside a system by examining its external outputs. The three pillars are:

1. **Metrics** — Numbers over time. Good for: trending, alerting, capacity planning.
   - Example: `http_requests_total{status="500"}` — count of 500 errors per second

2. **Logs** — Event records. Good for: debugging specific incidents, auditing.
   - Example: `2026-06-18 14:23:01 ERROR checkout: database connection timeout after 30s`

3. **Traces** — Request journeys across services. Good for: latency analysis, dependency mapping.
   - Example: HTTP request to `/checkout` → calls `inventory` (50ms) → calls `payment` (250ms) → returns 200

#### The Debugging Workflow

```
[Alert fires: checkout error rate > 5%]
        │
        ▼
[Metrics dashboard: error spike at 14:20]
        │
        ▼
[Logs: filter by service=checkout, level=error]
  → "database connection timeout" errors
        │
        ▼
[Traces: find slow traces for checkout]
  → DB span taking 30s (connection pool exhausted)
        │
        ▼
[Root cause: slow DB query blocking pool]
```

---

## Module 2: OpenTelemetry Fundamentals

### 2.1 What is OpenTelemetry?

OpenTelemetry (OTel) is a CNCF open-source standard for telemetry collection. It provides:
- **Language SDKs** for automatic instrumentation (Go, Java, Python, Node.js, etc.)
- **OTLP protocol** — a vendor-neutral wire format for metrics, logs, and traces
- **OpenTelemetry Collector** — a standalone process for collecting, processing, and exporting telemetry

**Why OpenTelemetry matters:** Instrument your code once, send to any backend (xScaler, Prometheus, Jaeger, Datadog). No vendor lock-in.

### 2.2 OTel Collector Components

The OTel Collector is configured via a YAML file with three component types:

```yaml
receivers:     # How data gets IN
processors:    # What happens to data
exporters:     # Where data goes OUT

service:
  pipelines:
    metrics:
      receivers: [...]
      processors: [...]
      exporters: [...]
```

#### Receivers

| Receiver | Purpose | Protocol |
|---|---|---|
| `otlp` | Receives OTLP from apps/SDKs | gRPC :4317, HTTP :4318 |
| `prometheus` | Scrapes `/metrics` endpoints | HTTP pull |
| `hostmetrics` | Host CPU/memory/disk/network | System calls |
| `filelog` | Reads log files from disk | File I/O |
| `k8scluster` | Kubernetes cluster metadata | K8s API |

#### Processors

| Processor | Purpose |
|---|---|
| `memory_limiter` | Prevents OOM (set to 256 MiB for most agents) |
| `batch` | Groups events for efficient export |
| `resourcedetection` | Auto-detects cloud provider, region |
| `attributes` | Add, rename, delete attributes |
| `k8sattributes` | Add Pod/Deployment/Namespace labels |

#### Exporters

| Exporter | Purpose | Protocol |
|---|---|---|
| `prometheusremotewrite` | Send metrics to Mimir-compatible backends | HTTP POST |
| `otlphttp` | Send OTLP to any compatible backend | HTTP |
| `otlp` | Send OTLP via gRPC | gRPC |
| `loki` | Send logs to Loki | HTTP |
| `debug` | Print to stdout (for testing) | Stdout |

### 2.3 Deployment Models

#### Agent Mode
One collector per host. Collects local data and ships directly to xScaler.

```
[Application] → [OTel Collector (same host)] → [xScaler Envoy] → [Mimir/Loki/Tempo]
```

**Best for:** VM fleets, Kubernetes DaemonSets, environments with direct egress.

#### Gateway Mode
Centralised collector that receives from multiple applications/agents.

```
[App 1] ─────────────────────────┐
[App 2] → [OTel Gateway (shared)] → [xScaler Envoy] → [Mimir/Loki/Tempo]
[App 3] ─────────────────────────┘
```

**Best for:** Multi-tenant environments, centralised enrichment, large app fleets.

### Exercise 2.3 — View OTel Collector Configuration

Review the local dev OTel collector configuration:

```bash
cat /Users/pathum.fernando/Projects/xscaler/xscaler/deploy/otel/otel-collector.yaml
```

**Identify:**
1. What receivers are configured?
2. What is the batch processor timeout?
3. What does the `xscaler_cluster: local` label do?
4. Where does the collector send metrics?

**Expected answers:**
1. `prometheus` (scraping Mimir, Envoy, proxy-auth, Loki, Tempo) and `otlp` (gRPC + HTTP)
2. `timeout: 5s`
3. Tags all scraped metrics with `xscaler_cluster=local` so mimir-sync can identify which edge cluster they came from
4. Metrics → `system-mimir:9009` (Prometheus remote_write), Traces → `tempo:4318` (OTLP HTTP)

---

## Module 3: Data Collection Architecture

### 3.1 How Data Flows Through xScaler

#### Metrics Ingestion Flow

```
Your App / OTel Collector
    │
    │  POST /api/v1/push
    │  Authorization: Bearer <api_key>
    │  X-Scope-OrgID: <tenant_id>
    ▼
AWS ALB (euw1-01.m.xscalerlabs.com)
    │
    ▼
Envoy :8080
    │
    │  gRPC Check() — passes headers
    ▼
proxy-auth :9001
    │  Validates token hash against portal-api
    │  Checks rate limits / plan caps
    │  Returns: inject X-Scope-OrgID header
    ▼
Mimir Distributor
    │
    ▼
Mimir Ingester → S3 (every 1 minute)
```

#### Key Headers

| Header | Value | Purpose |
|---|---|---|
| `Authorization` | `Bearer xag_abc123...` | API key authentication |
| `X-Scope-OrgID` | `xs_acme_ab3cd4ef` | Tenant namespace |
| `X-Xscalor-Plan` | `scale` (injected by proxy-auth) | Plan visibility |

### 3.2 Multi-Tenant Isolation

Each tenant ID creates an independent namespace in all backends:

```
Mimir: Block storage prefix = /xs_acme_ab3cd4ef/...
Loki:  Chunk storage prefix = /xs_acme_ab3cd4ef/...
Tempo: Block storage prefix = /xs_acme_ab3cd4ef/...
```

**Critical rule:** You can ONLY write or read data for the tenant ID that matches your API key. proxy-auth enforces this — if your API key was created for tenant `xs_acme_prod`, you cannot access `xs_acme_staging` with the same key.

### Workshop 3.3 — Design Your Collection Strategy

Use this worksheet to design the telemetry collection for a sample environment.

**Environment:** A 3-tier web application (NGINX + Python Flask + PostgreSQL) on 5 VMs.

| Question | Your Answer |
|---|---|
| What signals do you need? | |
| Which collection model? (agent/gateway) | |
| What receivers will you use? | |
| What processors do you need? | |
| How many API keys do you need? | |
| What labels will you use? | |

**Reference answer on next page →**

---

*Reference answer:*
- Signals: Metrics (CPU/memory/HTTP stats) + Logs (NGINX access + Flask errors) + no traces (monolith)
- Model: Agent Mode — one collector per VM
- Receivers: `hostmetrics`, `prometheus` (NGINX stub_status + Flask metrics), `filelog` (NGINX access log, Flask log)
- Processors: `memory_limiter` (256 MiB), `batch` (5s timeout), `resourcedetection` (cloud metadata)
- API keys: 2 — one for the prod VMs, one for staging (separate tenants)
- Labels: `environment=production`, `team=backend`, `service=web-tier`

---

## Module 4: Tenant Setup and Agent Deployment

### 4.1 Creating a Tenant

#### Using the Portal UI

1. Navigate to Metrics → Tenants → New Tenant
2. Fill in:
   - **Display Name:** `Production Environment`
   - **Environment:** `prod`
3. Click Create

**[Screenshot placeholder: New Tenant creation dialog with Display Name and Environment fields]**

After creation, you'll see:
- **Tenant ID:** `xs_acme_ab3cd4ef`
- **Metrics host:** `euw1-01.m.xscalerlabs.com`
- **Logs host:** `euw1-01.l.xscalerlabs.com`
- **Traces host:** `euw1-01.t.xscalerlabs.com`

#### Using the API

```bash
# Login to get JWT token
export JWT_TOKEN=$(curl -s -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}' | jq -r '.token')

# Create tenant
curl -s -X POST http://localhost:8081/tenants \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Production Environment",
    "environment": "prod"
  }' | jq

# Expected output:
# {
#   "id": "xs_acme_ab3cd4ef",
#   "display_name": "Production Environment",
#   "environment": "prod",
#   "metrics_host": "euw1-01.m.xscalerlabs.com",
#   "logs_host": "euw1-01.l.xscalerlabs.com",
#   "status": "active"
# }
```

### 4.2 Creating API Keys

```bash
# Set your tenant ID
export TENANT_ID="xs_acme_ab3cd4ef"

# Create API key
export API_KEY_JSON=$(curl -s -X POST \
  "http://localhost:8081/tenants/$TENANT_ID/keys" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "production-collector"}')

# Extract the key (only shown once!)
export API_KEY=$(echo $API_KEY_JSON | jq -r '.key')
echo "API Key: $API_KEY"
echo "STORE THIS SECURELY - it will not be shown again"
```

**[Screenshot placeholder: API key creation success page showing key value, name, and "Copy key" button]**

### 4.3 Deploying OTel Agents

#### Step 1 — Create an Enrollment Token

In the portal, navigate to **Agents → Enrollment → Create Enrollment Token**:
- Name: `production-agents`
- Default labels: `{"environment": "production", "team": "platform"}`
- Max uses: `50` (optional limit)
- Expires: 30 days (optional)

**[Screenshot placeholder: Enrollment token creation form with Name, Default Labels JSON, Max Uses, and Expiry fields]**

Save the token — it starts with `xse_`. Example: `xse_abc123...`

#### Step 2 — Install the OpAMP Supervisor

On the target host:

```bash
# Download otelcol-contrib (the managed collector binary)
curl -L -o otelcol-contrib.tar.gz \
  https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.122.1/otelcol-contrib_0.122.1_linux_amd64.tar.gz
tar xzf otelcol-contrib.tar.gz
sudo mv otelcol-contrib /usr/local/bin/

# Download OpAMP supervisor
curl -L -o supervisor.tar.gz \
  https://github.com/open-telemetry/opentelemetry-collector-contrib/releases/download/v0.122.1/opampsupervisor_0.122.1_linux_amd64.tar.gz
tar xzf supervisor.tar.gz
sudo mv opampsupervisor /usr/local/bin/
```

#### Step 3 — Configure the Supervisor

```bash
sudo mkdir -p /etc/otel-supervisor /var/lib/otel-supervisor

cat << 'EOF' | sudo tee /etc/otel-supervisor/supervisor.yaml
server:
  endpoint: wss://agents.xscalerlabs.com/v1/opamp
  headers:
    Authorization: "Bearer xse_YOUR_ENROLLMENT_TOKEN"

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
  directory: /var/lib/otel-supervisor
EOF
```

For **local dev training**, use:
```yaml
server:
  endpoint: ws://agent-api:8082/v1/opamp
  headers:
    Authorization: "Bearer xse_localdev0000000000000000000000"
```

#### Step 4 — Run the Supervisor

```bash
# As a systemd service (production)
cat << 'EOF' | sudo tee /etc/systemd/system/otel-supervisor.service
[Unit]
Description=OpenTelemetry OpAMP Supervisor
After=network.target

[Service]
Type=simple
User=otel
ExecStart=/usr/local/bin/opampsupervisor --config /etc/otel-supervisor/supervisor.yaml
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now otel-supervisor
```

```bash
# For local dev training (Docker Compose already runs the supervisor):
docker compose logs agent-1
# Look for: "Connected to server", "Config applied"
```

### 4.4 Configuration Management

#### Creating a Config Template

Navigate to **Agents → Config → New Template**:

**Template name:** `metrics-and-logs-collector`

**Template body:**
```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
  hostmetrics:
    collection_interval: 60s
    scrapers:
      cpu:
      memory:
      disk:
      network:

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 256
  batch:
    timeout: 5s
    send_batch_size: 1024
  resourcedetection:
    detectors: [env, system]

exporters:
  prometheusremotewrite:
    endpoint: https://euw1-01.m.xscalerlabs.com/api/v1/push
    headers:
      Authorization: Bearer ${secret:xscaler_api_key}
      X-Scope-OrgID: ${secret:xscaler_tenant_id}
  otlphttp/loki:
    endpoint: https://euw1-01.l.xscalerlabs.com
    headers:
      Authorization: Bearer ${secret:xscaler_api_key}
      X-Scope-OrgID: ${secret:xscaler_tenant_id}

service:
  pipelines:
    metrics:
      receivers: [otlp, hostmetrics]
      processors: [memory_limiter, batch, resourcedetection]
      exporters: [prometheusremotewrite]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/loki]
```

**[Screenshot placeholder: Config template editor with YAML syntax highlighting, showing the template above]**

#### Creating a Config Assignment

After saving the template, create an assignment:

- **Label selector:** `{"matchLabels": {"environment": "production"}}`
- **Priority:** `0`
- **Enabled:** `true`

This assigns the template to all agents with the `environment=production` label.

#### Adding Secrets

Navigate to **Agents → Config → Secrets → Add Secret**:
- Name: `xscaler_api_key`
- Value: `xag_abc123...` (your API key)

- Name: `xscaler_tenant_id`
- Value: `xs_acme_ab3cd4ef`

**[Screenshot placeholder: Secret creation dialog with Name and Value fields, noting value is write-only]**

#### Verifying Config Delivery

Navigate to **Agents → [your agent]** to see:
- **Status:** `online` (green)
- **Last Config Hash:** SHA-256 hash of current config
- **Delivery History:** Recent `applied`/`failed` events

**[Screenshot placeholder: Agent detail page showing status=online, delivery history table with config_hash and status columns]**

---

# DAY 2

---

## Module 5: Grafana Integration

### 5.1 Datasource Configuration

#### Connecting to Metrics (Prometheus/Mimir)

1. Open Grafana at http://localhost:3001
2. Go to **Connections → Datasources → Add new datasource**
3. Select **Prometheus**
4. Configure:
   ```
   Name:   xScaler Metrics
   URL:    http://localhost:8080
   ```
5. Expand **Custom HTTP Headers**:
   - Header 1: `Authorization` → `Bearer xag_<your_api_key>`
   - Header 2: `X-Scope-OrgID` → `xs_acme_ab3cd4ef`
6. Click **Save & test**

**Expected output:** "Data source connected and labels found."

**[Screenshot placeholder: Prometheus datasource configuration page with URL, Custom HTTP Headers section expanded showing two header rows]**

#### Connecting to Logs (Loki)

1. Add new datasource → **Loki**
2. Configure:
   ```
   Name:   xScaler Logs
   URL:    http://localhost:8181
   ```
3. Custom HTTP Headers:
   - `Authorization` → `Bearer xag_<your_api_key>`
   - `X-Scope-OrgID` → `xs_acme_ab3cd4ef`
4. Save & test

**Expected output:** "Data source connected and labels found."

#### Connecting to Traces (Tempo)

1. Add new datasource → **Tempo**
2. Configure:
   ```
   Name:   xScaler Traces
   URL:    http://localhost:8282
   ```
3. Custom HTTP Headers:
   - `Authorization` → `Bearer xag_<your_api_key>`
   - `X-Scope-OrgID` → `xs_acme_ab3cd4ef`
4. Save & test

**Expected output:** "Data source connected."

#### Linking Metrics, Logs, and Traces

Configure trace-to-logs correlation in the Tempo datasource:
- Trace to logs: **Loki** datasource
- Tags: `trace_id`

Configure exemplar linking in the Prometheus datasource:
- Exemplar → Trace URL template: `${__value.raw}` linking to Tempo datasource

**[Screenshot placeholder: Tempo datasource page showing "Trace to Logs" section with Loki datasource and trace_id tag configured]**

### 5.2 Validating Data Ingestion

Run these commands to verify data is flowing to each backend:

```bash
export API_KEY="xag_your_api_key_here"
export TENANT_ID="xs_acme_ab3cd4ef"

# Validate metrics
curl -s \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "http://localhost:8080/api/v1/query?query=up" | jq '.data.result | length'
# Expected: a positive integer (number of 'up' metrics)

# Validate logs  
curl -s \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  'http://localhost:8181/loki/api/v1/labels' | jq '.data'
# Expected: list of label names

# Validate traces
curl -s \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "http://localhost:8282/api/search?limit=1" | jq '.traces | length'
# Expected: a positive integer (number of traces found)
```

---

## Module 6: Dashboards, APM, and Alerting

### 6.1 Creating Your First Dashboard

#### Create a Metrics Dashboard

1. Navigate to **Dashboards → New Dashboard**
2. Click **Add visualisation**
3. Select the **xScaler Metrics** datasource
4. In the query editor, enter:
   ```promql
   rate(http_requests_total[5m])
   ```
5. Select **Time series** visualisation
6. Set panel title: `HTTP Request Rate`
7. Add a second panel with:
   ```promql
   histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
   ```
8. Title: `HTTP p99 Latency`
9. Add threshold: Orange at 0.5, Red at 1.0 (seconds)

**[Screenshot placeholder: Grafana dashboard with two panels - HTTP Request Rate time series and HTTP p99 Latency with threshold lines]**

10. Save dashboard: **"Service Overview"**

### 6.2 Exploring Logs

1. Navigate to **Explore**
2. Select the **xScaler Logs** datasource
3. Enter a LogQL query:
   ```logql
   {job="loadgen"}
   ```
4. View the log lines
5. Filter to errors only:
   ```logql
   {job="loadgen"} |= "error"
   ```
6. Parse JSON structured logs:
   ```logql
   {job="loadgen"} | json | level = "error"
   ```

**[Screenshot placeholder: Grafana Explore view with Loki datasource, LogQL query bar, and log lines in the result panel]**

### 6.3 Exploring Traces

1. In Explore, switch to the **xScaler Traces** datasource
2. Use the Search tab:
   - Service: `loadgen`
   - Min Duration: `100ms`
3. Click on a trace to view the waterfall
4. Observe: span names, duration, service breakdown

**[Screenshot placeholder: Grafana Explore view with Tempo datasource showing trace search results and a trace waterfall diagram]**

### 6.4 Creating an Alert

1. Navigate to **Alerting → Alert Rules → New Alert Rule**

2. Configure:
   - **Rule name:** `High Error Rate`
   - **Folder:** `Platform Alerts`

3. **Query A:**
   ```promql
   sum(rate(http_requests_total{status=~"5.."}[5m]))
   / sum(rate(http_requests_total[5m]))
   ```

4. **Condition:**
   - Threshold: `IS ABOVE`
   - Value: `0.05` (5%)

5. **Evaluation:**
   - Evaluate every: `1m`
   - For: `2m` (fires after 2 consecutive evaluations above threshold)

6. **Annotations:**
   - Summary: `High error rate: {{ $values.A.Value | humanizePercentage }}`
   - Description: `Error rate on service {{ $labels.service }} is above 5%`
   - Runbook: `https://wiki.internal/runbooks/high-error-rate`

7. **Contact point:** Select your email contact point
8. Save

**[Screenshot placeholder: Alert rule creation page with PromQL query, threshold condition, and evaluation interval configured]**

---

## Module 7: Hands-On Lab

### Lab Objectives

By the end of this lab, you will have:
- Created a tenant with API keys
- Enrolled an OTel agent via OpAMP
- Created and deployed a config template
- Configured Grafana datasources
- Built a dashboard with metrics, logs, and traces panels
- Created at least one alert rule

### Step-by-Step Lab Instructions

See the separate **Hands-on Lab Guide (06_hands_on_labs.md)** for detailed instructions.

---

## Quick Reference Card

### Key API Commands

```bash
# Login
curl -s -X POST http://localhost:8081/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"pass"}' | jq -r '.token'

# Create tenant
curl -s -X POST http://localhost:8081/tenants \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"display_name":"My Tenant","environment":"prod"}' | jq

# Create API key
curl -s -X POST http://localhost:8081/tenants/$TENANT_ID/keys \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-collector"}' | jq

# Test metrics push
curl -s -X POST http://localhost:8080/api/v1/push \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  -H "Content-Type: application/x-protobuf" \
  --data-binary @/tmp/sample.pb

# Query metrics
curl -s "http://localhost:8080/api/v1/query?query=up" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" | jq
```

### Key Concepts Cheat Sheet

| Concept | Value / Example |
|---|---|
| Tenant ID format | `xs_acme_ab3cd4ef` |
| Enrollment token prefix | `xse_` |
| Agent key prefix | `xag_` |
| Metrics endpoint | `/api/v1/push` (Prom) or `/otlp/v1/metrics` (OTLP) |
| Logs endpoint | `/api/v1/push` (Loki) or `/otlp/v1/logs` (OTLP) |
| Traces endpoint | `/otlp/v1/traces` (HTTP) or gRPC :4317 |
| OpAMP supervisor config | `wss://agents.xscalerlabs.com/v1/opamp` |
| Config secret syntax | `${secret:secret_name}` |
| Plan limits (Free) | 20k series, 50 GB logs/mo |
| Plan limits (Scale) | $19 base + metered above free |

### Troubleshooting Quick Reference

| Problem | Check | Command |
|---|---|---|
| 401 Unauthorized | Invalid or missing API key | Verify `Authorization: Bearer xag_...` header |
| 403 Forbidden | Path not allowed for backend kind | Check `AUTH_BACKEND_KIND` on proxy-auth |
| 400 X-Scope-OrgID | Multiple OrgIDs in header | Use `|` separator, not comma or multiple headers |
| Agent not enrolling | Enrollment token invalid/expired | Check token in portal Agents → Enrollment |
| Agent offline | Network or supervisor crash | `journalctl -u otel-supervisor -n 50` |
| Config not applying | Secret unavailable or YAML invalid | Check Agents → [agent] → Delivery History |
| Datasource test fails | Wrong URL or headers | Verify URL matches Envoy port for signal type |
| No data in Grafana | Wrong tenant ID in header | Confirm X-Scope-OrgID matches tenant |
