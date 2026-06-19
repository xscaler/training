# xScaler Observability Platform
# Instructor Guide — 2-Day Training Programme
**Duration:** 2 Days (12–14 hours)  
**Target Audience:** Platform Administrators, DevOps Engineers, SRE Engineers, Operations Teams  
**Format:** Instructor-led with hands-on labs

---

## How to Use This Guide

This guide provides detailed talking points, demonstration instructions, Q&A guidance, and timing for each session. Italicised text in brackets [*like this*] are private trainer notes, not for participant handouts. Bold text indicates key points to emphasise.

---

## Day 1 Overview

| Session | Topic | Duration |
|---|---|---|
| Session 1 | Platform Introduction and User Management | 90 min |
| Lab 1 | Account creation and user management | 30 min |
| Break | | 15 min |
| Session 2 | OpenTelemetry Fundamentals | 90 min |
| Lab 2 | OTel collector configuration | 30 min |
| Lunch | | 60 min |
| Session 3 | Data Collection Architecture | 90 min |
| Workshop | Customer use case design | 45 min |
| Break | | 15 min |
| Session 4 | Tenant Setup and Agent Deployment | 90 min |
| Lab 4 | Tenant creation and agent enrollment | 30 min |

---

## Day 2 Overview

| Session | Topic | Duration |
|---|---|---|
| Session 5 | Grafana Integration | 90 min |
| Lab 5 | Datasource configuration | 30 min |
| Break | | 15 min |
| Session 6 | Dashboards, APM, and Alerting | 90 min |
| Lab 6 | Dashboard and alert creation | 30 min |
| Lunch | | 60 min |
| Session 7 | Hands-on Lab and Q&A | 150 min |
| Wrap-Up | Best practices + Q&A | 30 min |

---

## SESSION 1: Platform Introduction and User Management (90 min)

### 1.1 Introduction to the Platform (30 min)

**Session Objectives:**
- Participants understand xScaler's role as a managed observability SaaS
- Participants can describe the major components and their relationships
- Participants understand the two-cluster (control plane / edge) deployment model

**Talking Points:**

*[Start with the big picture. Don't go into technical detail yet — that comes in Session 2.]*

"xScaler is a multi-tenant SaaS observability platform. Instead of your team managing Prometheus, Loki, and Tempo separately — installing, scaling, patching, backing up — xScaler runs this infrastructure for you and gives each of your environments a dedicated, isolated data silo."

Key points to cover:
- **The control plane** is the brains — it manages users, tenants, API keys, billing. Customers interact with it through the portal UI (`portal-web`) or the REST API.
- **Edge clusters** are the workhorses — they sit in specific AWS regions and store and query your metrics, logs, and traces data. When you push a metric from your app, it goes to the nearest edge cluster.
- **The isolation model** — every customer gets a unique Tenant ID (e.g. `xs_acme_ab3cd4ef`). This ID is the `X-Scope-OrgID` header that flows through the entire platform. Your data never touches another customer's data.

**Architecture Walkthrough [Show Diagram A]:**

Point to each component on the diagram as you describe it:
1. "Users interact through the Portal at `portal.xscalerlabs.com` — this is built on Next.js."
2. "The Portal calls `portal-api` — our Go control plane. All your tenant setup, key management, usage data comes from here."
3. "When your application sends metrics, it goes through Envoy at `euw1-01.m.xscalerlabs.com`. Envoy is the edge gateway."
4. "Every single request is checked by `proxy-auth` — it validates your Bearer token and injects the tenant ID before data reaches Mimir."
5. "Data lands in Mimir (metrics), Loki (logs), or Tempo (traces) and is stored in AWS S3."
6. "Grafana connects to these backends to visualise your data."

**Key Metrics / Scale Numbers:**
- Free plan: 20,000 active time series, 50 GB/month logs
- Scale plan: $19/month base, metered above free quota
- Plans are per-organisation, not per-environment

**Q&A guidance:**
- Q: "Why is there an Envoy between my app and Mimir?"
  A: "Envoy is our edge gateway. It handles routing to the right backend and passes every request through `proxy-auth` for token validation. This is how we keep tenant data isolated — only data with valid credentials matching the correct tenant ID gets through."
- Q: "Do you store my data in shared storage?"
  A: "Yes, we use shared S3 buckets, but data is namespaced by your tenant ID at the block/chunk level. The backends enforce strict tenant isolation — you can only query your own data using your credentials."

---

### 1.2 User Management (30 min)

**Session Objectives:**
- Participants can create an account and navigate the portal
- Participants understand the three user roles (owner, admin, member)
- Participants can invite team members and manage permissions

**Talking Points:**

**Account Creation:**
"There are two ways users get into xScaler. The primary path in production is AWS Cognito SSO — you sign in through your identity provider. In local dev and some enterprise setups, there's a local login path."

Walk through the auth flow [Show Diagram G]:
1. User navigates to `portal.xscalerlabs.com/login`
2. Redirected to Cognito hosted UI
3. After sign-in, `portal-web` exchanges the Cognito token at `POST /auth/cognito/exchange`
4. A short-lived JWT (30 minutes) is stored in an HttpOnly cookie
5. All portal requests include this cookie automatically

**User Roles [Show table on slide]:**

| Role | Who is it? | What can they do? |
|---|---|---|
| `owner` | First user who created the org | Everything — including billing and deleting the org |
| `admin` | Users invited as administrators | Manage tenants, API keys, settings, invite members |
| `member` | Regular team members | View tenants, view usage, manage their own API keys |

[*Emphasise this is RBAC enforced server-side in portal-api middleware, not just UI-level.]*

**Invitation Flow:**
"When you invite a user as admin or member, they receive an email and click a link. Behind the scenes, portal-api creates a record in `organization_members`. All their access is tied to your organisation — they cannot see any other organisation's data even if they have separate accounts."

**Best Practice for Teams:**
- Create an 'admin' role user for each team lead
- Use 'member' role for engineers who only need read access
- Rotate the owner role if the original owner leaves
- Never share the owner account — use separate logins per person

**Demo Instructions:**
1. Navigate to the portal home page
2. Show the `/settings/members` page
3. Demonstrate adding a new member (use a fake email for demo purposes)
4. Show role assignment dropdown
5. Explain the invitation email (show in Mailpit for local dev)

---

### 1.3 Observability Fundamentals (30 min)

**Session Objectives:**
- Participants understand what metrics, logs, and traces are
- Participants understand the relationship between the three signals
- Participants can map real-world scenarios to the right signal type

**Talking Points:**

**What are Metrics?**
"Metrics are numeric measurements recorded over time. A CPU utilisation reading every 15 seconds is a metric. The number of HTTP requests per second is a metric. HTTP error rate is a metric."

Key characteristics:
- **Numeric values** with a timestamp
- **Low cardinality** labels (environment, service, region)
- **Aggregatable** — you can sum, average, percentile
- Best for: trending, alerting, capacity planning

In xScaler: stored in **Grafana Mimir** using the Prometheus data model.

"Prometheus remote_write is the standard protocol. Your app or OTel collector pushes metrics to `euw1-01.m.xscalerlabs.com/api/v1/push`."

**What are Logs?**
"Logs are text records of events. Every time your application does something — handles a request, throws an error, starts a service — it can emit a log line."

Key characteristics:
- **Unstructured or structured** text
- **High cardinality** potential (per-request data)
- **Searchable** with full-text or structured queries (LogQL)
- Best for: debugging, auditing, tracing specific requests

In xScaler: stored in **Grafana Loki** using the TSDB schema.

"The key insight with Loki is that it indexes labels, not the log content. This makes it very efficient. You push logs to `euw1-01.l.xscalerlabs.com/api/v1/push`."

**What are Traces?**
"A trace represents the complete journey of a request through your distributed system. One HTTP request might touch 5 different services — a trace captures all of that as connected 'spans' with timing data."

Key characteristics:
- **Distributed** — spans multiple services
- **Hierarchical** — parent and child spans
- **Latency analysis** — where is time being spent?
- Best for: root cause analysis, latency debugging, dependency mapping

In xScaler: stored in **Grafana Tempo** using OTLP protocol.

"Traces go to `euw1-01.t.xscalerlabs.com/otlp/v1/traces`."

**The Golden Triangle [Show Diagram]:**
"These three signals are most powerful when used together. A typical debugging workflow:

1. **Metrics** alert you that error rate on `/api/checkout` is 5% (above 1% threshold)
2. **Logs** help you find the specific error messages and the request IDs
3. **Traces** let you follow one specific failing request across all services to see exactly where and why it failed

This is sometimes called the 'Three Pillars of Observability' or the 'MELT model' (Metrics, Events/Logs, Traces)."

**Real-World Use Cases:**

| Scenario | Signal | Query example |
|---|---|---|
| "Is the API slow?" | Metrics | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))` |
| "Why did that user's payment fail?" | Logs | `{service="payment"} |= "user_id=12345" |= "error"` |
| "Which service added 200ms to checkout?" | Traces | Search by service + min duration in Tempo |
| "Are we about to run out of disk?" | Metrics | `node_disk_free_bytes / node_disk_total_bytes` |

---

## SESSION 2: OpenTelemetry Fundamentals (90 min)

### 2.1 OpenTelemetry Overview (20 min)

**Session Objectives:**
- Participants understand what OpenTelemetry is and why it matters
- Participants know the OTel project components (SDK, Collector, specification)

**Talking Points:**

"Before OpenTelemetry, every observability vendor had its own agent, its own SDK, its own wire format. You were locked in. If you wanted to switch from Datadog to Prometheus, you had to re-instrument your entire application."

"OpenTelemetry changed this. It's a CNCF standard — vendor-neutral instrumentation for cloud-native software. Your app emits OTLP (OpenTelemetry Protocol), and you choose where it goes. xScaler accepts OTLP natively."

**Key OTel Components:**
1. **Language SDKs** — libraries for Go, Java, Python, Node.js, etc. You instrument your code once.
2. **OTLP Protocol** — the wire format (gRPC or HTTP) that carries metrics, logs, and traces
3. **OpenTelemetry Collector** — a standalone process that receives, processes, and exports telemetry
4. **Semantic Conventions** — standard attribute names (e.g., `service.name`, `http.method`)

"xScaler works with ALL of these. You can use the OTel SDK to auto-instrument your app, send OTLP to an OTel collector, and the collector forwards to xScaler."

**Why OTel Matters for xScaler Customers:**
- Write instrumentation once, switch backends without code changes
- Collect metrics from Prometheus AND OTLP in the same collector
- Transform and enrich telemetry before it reaches xScaler
- Use the same tool for all three signals (metrics/logs/traces)

---

### 2.2 OTel Collector Components (35 min)

**Session Objectives:**
- Participants understand the receiver/processor/exporter/pipeline model
- Participants can read and write basic collector configurations

**Talking Points:**

"The OTel Collector is the Swiss Army knife of observability. It has three types of components that form pipelines:"

**Receivers** — "How data gets INTO the collector"
- `otlp` — receives OTLP metrics, logs, and traces (gRPC :4317, HTTP :4318)
- `prometheus` — scrapes Prometheus endpoints (pull model)
- `hostmetrics` — collects CPU, memory, disk, network from the host
- `filelog` — reads log files from disk
- `k8scluster` — Kubernetes cluster metadata

"In xScaler's local dev setup, the OTel collector at `deploy/otel/otel-collector.yaml` uses the `prometheus` receiver to scrape Mimir, Envoy, and proxy-auth. Let me show you that file..."

[*Show the actual otel-collector.yaml from the repository]*

```yaml
receivers:
  prometheus:
    config:
      scrape_configs:
        - job_name: client-mimir
          metrics_path: /metrics
          static_configs:
            - targets: ["client-mimir:9009"]
              labels:
                xscaler_cluster: local
        - job_name: envoy
          metrics_path: /stats/prometheus
          static_configs:
            - targets: ["envoy:9901"]
              labels:
                xscaler_cluster: local
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
```

"Notice the `xscaler_cluster: local` label — this is added to every metric. In production, this would be `euw1-01`, matching the edge cluster name. mimir-sync uses this label to route metrics from each cluster."

**Processors** — "What happens to data IN the collector"
- `memory_limiter` — prevents OOM by queuing pressure
- `batch` — groups data for efficient export (reduces network calls)
- `resourcedetection` — auto-detects cloud provider, region, instance type
- `attributes` — add, rename, or delete attributes
- `k8sattributes` — enriches with Pod/Deployment/Namespace labels

"The xScaler collector uses `memory_limiter` (256 MiB limit) and `batch` (5 second timeout, 1024 events per batch). For production, you'd typically add `resourcedetection` to tag with cloud metadata."

**Exporters** — "Where data GOES from the collector"
- `prometheusremotewrite` — sends metrics in Prometheus remote_write format
- `otlphttp` / `otlp` — sends OTLP to any compatible backend
- `debug` — prints to stdout (for development)
- `loki` — sends logs to Loki's native API

"The local dev collector remote-writes to `system-mimir` (the platform's own monitoring Mimir) and sends traces to Tempo. Customer-facing data flows through Envoy with authentication headers."

**Pipelines** — "How components are wired together"
```yaml
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

"Each signal type (metrics, logs, traces) is an independent pipeline. You can have multiple pipelines of the same type — for example, sending metrics to two different backends simultaneously."

**Key Insight:** "Notice that processors in the metrics pipeline only process metrics. If you want to process logs AND metrics the same way, you add the processor to both pipelines."

---

### 2.3 Deployment Models (25 min)

**Agent Mode [Show Diagram B]:**

"In Agent Mode, you run one OTel Collector per host or per node. It collects data from apps on that host and forwards directly to xScaler."

**When to use Agent Mode:**
- You control the hosts (VMs, bare metal, Kubernetes nodes)
- You want per-host metrics (`hostmetrics` receiver)
- You want low latency (no intermediate hop)
- You have a small to medium number of nodes

**Agent Mode architecture:**
```
[App] --OTLP--> [Collector Agent] --remote_write--> [Envoy] --> [Mimir]
[Host metrics] ----------^
```

"In xScaler, Agent Mode is managed via OpAMP. Instead of manually configuring each agent, you define a config template in the portal and the platform pushes it to all enrolled agents automatically. This is huge — you can update 50 agents with one click."

**Gateway Mode [Show Diagram C]:**

"In Gateway Mode, a central OTel Collector receives from multiple applications or agents, processes and enriches the data, then exports to xScaler."

**When to use Gateway Mode:**
- Multi-tenant environments (SaaS apps, shared clusters)
- You need centralised enrichment (add cloud metadata)
- You want to decouple app teams from the observability backend
- You need fan-in (collect from many apps, export to one backend)

**Gateway Mode architecture:**
```
[App 1] --OTLP-->            --> [Envoy] --> [Mimir]
[App 2] --OTLP--> [Gateway] -
[App 3] --OTLP-->            --> [Envoy] --> [Loki]
```

---

### 2.4 Agent vs Gateway — Design Considerations (10 min)

[*Present as a decision matrix. Don't tell them which is better — help them think through their situation.]*

| Consideration | Agent Mode | Gateway Mode |
|---|---|---|
| Complexity | Lower (simple deployment) | Higher (central point to manage) |
| Scalability | Scales with nodes | Scales with gateway replicas |
| SPOF risk | None (each agent independent) | Gateway is a critical path |
| Enrichment | Per-agent | Centralised |
| Filtering | Per-agent | Centralised |
| Config management | OpAMP (xScaler portal) | Manual or OpAMP for gateway |
| Cost | One process per node | One or few central processes |
| Network traffic | Data exits each node | Data funnels through gateway |

**Recommendation for most xScaler customers:**
- Start with Agent Mode + OpAMP management — simpler to set up, xScaler manages the config lifecycle
- Move to Gateway Mode if you need centralised enrichment or have many apps behind a single tenant

---

## SESSION 3: Data Collection Architecture (90 min)

### 3.1 Metrics Collection Methods (30 min)

**Session Objectives:**
- Participants understand pull vs push collection models
- Participants can choose the right model for their environment

**Pull-Based Collection (Prometheus Scraping):**

"Prometheus invented the pull model. Instead of your app pushing data to a collector, Prometheus polls your app's `/metrics` endpoint on a schedule (e.g., every 60 seconds). Your app exposes metrics in the Prometheus text format."

"With xScaler, you use the OTel Collector's `prometheus` receiver to scrape your apps, then remote_write the data to xScaler. This is the same model used internally by xScaler to scrape Mimir and proxy-auth:

```yaml
# From deploy/otel/otel-collector.yaml
scrape_configs:
  - job_name: proxy-auth
    metrics_path: /metrics
    static_configs:
      - targets: ["proxy-auth:9002"]
        labels:
          xscaler_cluster: local
```

**Pull model considerations:**
- ✅ Your app is simple — just expose an endpoint
- ✅ Easy service discovery (Kubernetes, Consul, DNS)
- ✅ Scrape interval tunable per target
- ❌ Collector must have network access TO the app
- ❌ Short-lived jobs (e.g., Kubernetes Jobs) may be missed

**Push-Based Collection (OTLP):**

"In the push model, your app or OTel SDK pushes telemetry to a collector endpoint. OTLP is the standard protocol — both gRPC (port 4317) and HTTP (port 4318) are supported."

```yaml
# App configured with OTel SDK
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
OTEL_EXPORTER_OTLP_PROTOCOL=grpc
```

**Push model considerations:**
- ✅ Works for short-lived processes (push before exit)
- ✅ No network inbound requirements for collector
- ✅ Supports all three signals (metrics/logs/traces)
- ❌ App must know where the collector is
- ❌ If collector is down, data may be lost (mitigated with retry buffers)

---

### 3.2 End-to-End Architecture Review (30 min)

[Show Diagram D — the full sequence diagram. Walk through each step.]*

**Step-by-step walkthrough:**

1. "Your application is instrumented with the OTel SDK or you have a Prometheus /metrics endpoint."

2. "The OTel Collector Agent on the same host either scrapes or receives the data."

3. "The collector formats data as Prometheus remote_write (for metrics) and sends it to `euw1-01.m.xscalerlabs.com/api/v1/push`. It includes:
   - `Authorization: Bearer xag_<your_api_key>`
   - `X-Scope-OrgID: xs_acme_ab3cd4ef` (your tenant ID)"

4. "The request hits the AWS ALB, which routes to Envoy."

5. "Envoy's `ext_authz` filter sends a gRPC `Check()` to proxy-auth (250ms timeout). proxy-auth:
   - SHA-256 hashes the Bearer token
   - Looks up in its local cache (10s TTL)
   - On cache miss: calls portal-api's internal snapshot endpoint
   - Validates tenant ID matches the API key"

6. "If valid, proxy-auth returns OK with headers to inject. Envoy adds:
   - `X-Scope-OrgID: xs_acme_ab3cd4ef`
   - `X-Xscalor-Plan: scale`"

7. "Envoy forwards to the Mimir Distributor. Mimir uses `X-Scope-OrgID` as the tenant key — all data is stored with this key prefix."

8. "Meanwhile, `mimir-sync` polls system-mimir every 60 seconds, calculates how many active series your tenant has, and writes to the `tenant_usage` Postgres table."

9. "Your Grafana instance connects with the same credentials and queries through the same Envoy gateway."

**The Critical Header — emphasise this:**

"Every single piece of data in the platform is namespaced by the `X-Scope-OrgID` header. If this header is missing or wrong, you either get an error or you'd be writing to the wrong tenant. proxy-auth ensures this can't happen — it validates the Bearer token and forces the correct tenant ID."

---

### 3.3 Customer Use Case Workshop (30 min)

[*This is an interactive session. Have participants work in groups of 2-3. Give each group a scenario card.*]

**Workshop Instructions for Trainer:**

"I'm going to give you a scenario card. In your group, answer these questions:
1. What signals do you need to collect? (metrics? logs? traces? all three?)
2. What collection method do you recommend? (agent mode? gateway mode? pull? push?)
3. Draw the data flow from your application to xScaler
4. What are the main risks or challenges?

You have 15 minutes, then we'll share with the group."

**Scenario Cards:**

**Scenario A — Kubernetes Microservices:**
"You run a 20-service e-commerce application on Kubernetes. Services are instrumented with OTel Java SDK. You have Prometheus metrics from node exporters on each node. You need to collect metrics from all services, ship logs from pods, and capture traces."

*Expected answer: Gateway Mode collector per namespace or cluster, plus node-level agents for hostmetrics. OTLP push for metrics/logs/traces from services, prometheus receiver for node exporters.*

**Scenario B — Legacy VM Fleet:**
"You have 50 VMs running a traditional three-tier web app (NGINX, Tomcat, PostgreSQL). No OTel SDKs. You export logs to syslog. You want metrics and logs in xScaler."

*Expected answer: Agent Mode collector on each VM. Prometheus receiver scraping NGINX stub_status and JVM metrics via JMX receiver. Filelog receiver for syslog/application logs. No traces (legacy app).*

**Scenario C — Serverless Functions:**
"You use AWS Lambda for your API backend. Functions are short-lived (<100ms per invocation). You need to capture execution metrics and errors."

*Expected answer: OTLP push from Lambda (OTel Lambda layers). Collector may not be suitable — use the Lambda OTLP exporter directly to xScaler endpoint. Or an SQS/Kinesis forwarder pattern.*

---

## SESSION 4: Tenant Setup and Agent Deployment (90 min)

### 4.1 Tenant Administration (20 min)

**Session Objectives:**
- Participants can create a tenant and understand cluster assignment
- Participants understand tenant settings and what they control

**Talking Points:**

"A **tenant** in xScaler is an isolated data silo for a specific environment or application. Most customers create one tenant per environment:
- `xs_acme_prod` — production metrics/logs/traces
- `xs_acme_staging` — staging
- `xs_acme_dev` — development

Each tenant gets:
- A unique tenant ID (e.g., `xs_acme_ab3cd4ef`)
- A metrics endpoint (e.g., `euw1-01.m.xscalerlabs.com`)
- A logs endpoint (e.g., `euw1-01.l.xscalerlabs.com`)
- A traces endpoint (e.g., `euw1-01.t.xscalerlabs.com`)
- Its own API keys"

**Create a Tenant — API Example:**
```bash
# Create tenant
curl -s -X POST https://portal.xscalerlabs.com/tenants \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Production Environment",
    "environment": "prod"
  }' | jq

# Response
{
  "id": "xs_acme_ab3cd4ef",
  "display_name": "Production Environment",
  "environment": "prod",
  "metrics_host": "euw1-01.m.xscalerlabs.com",
  "logs_host": "euw1-01.l.xscalerlabs.com",
  "status": "active"
}
```

**Cluster Assignment:** "When you create a tenant, xScaler automatically assigns it to the edge cluster in your preferred region that has available capacity. The `cluster_id` links your tenant to a specific Mimir/Loki/Tempo stack."

**Tenant Environments:** "The `environment` field is metadata for your use — `prod`, `staging`, `dev`, `loadgen`. It doesn't affect routing or isolation. The `loadgen` environment is special in local dev — it activates the built-in load generator for that tenant."

**Create API Key:**
```bash
curl -s -X POST https://portal.xscalerlabs.com/tenants/xs_acme_ab3cd4ef/keys \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "production-collector"}' | jq

# Response (key shown ONLY once)
{
  "id": "...",
  "name": "production-collector",
  "key": "xag_abc123...",  # Store this securely!
  "created_at": "2026-06-18T..."
}
```

[*Emphasise: the plaintext key is shown ONLY at creation time. If lost, create a new key.*]

---

### 4.2 Agent Deployment Automation (35 min)

**Session Objectives:**
- Participants understand the OpAMP agent management model
- Participants can deploy the OpAMP supervisor
- Participants understand enrollment tokens and agent keys

**Talking Points:**

"Traditional observability tools require you to SSH into each machine, install the agent, copy a config file, start a service. If you have 50 machines and want to change the config, you SSH into all 50. This doesn't scale."

"xScaler uses **OpAMP** (Open Agent Management Protocol) — a WebSocket-based protocol that lets the platform push configurations to agents remotely. Your agent connects to our `agent-api` service and receives its config automatically."

**The OpAMP Flow [Show Diagram F]:**

1. **Create an enrollment token** in the portal at `/agents/enrollment`
   - Enrollment tokens have prefix `xse_`
   - They can be limited by max uses, expiry, and default labels
   - This token is a *one-time bootstrap* credential

2. **Install the supervisor** on the target machine:
   ```bash
   # Download the OpAMP supervisor
   curl -L https://github.com/open-telemetry/opentelemetry-collector-contrib/releases/download/v0.122.1/otelcol-contrib_0.122.1_linux_amd64.tar.gz | tar xz
   
   # Install supervisor (manages the collector process)
   # supervisor.yaml
   ```

3. **Configure the supervisor:**
   ```yaml
   # /etc/otel-supervisor/supervisor.yaml
   server:
     endpoint: wss://agents.xscalerlabs.com/v1/opamp
     headers:
       Authorization: "Bearer xse_<enrollment_token>"
   
   capabilities:
     accepts_remote_config: true
     reports_effective_config: true
     reports_health: true
   
   agent:
     executable: /usr/local/bin/otelcol-contrib
   
   storage:
     directory: /var/lib/otel-supervisor
   ```

4. **First connection:** The supervisor connects with the enrollment token. The `agent-api`:
   - Creates an agent record in the database
   - Mints a unique per-agent key (`xag_` prefix)
   - Sends the agent its per-agent key as new credentials
   - Sends the matched config template

5. **Subsequent connections:** The supervisor reconnects with the per-agent key. If the config has changed, it receives the new config and restarts the collector.

**Agent Labels:** 
"Labels are attributes the agent reports about itself — things like `environment`, `team`, `region`, `service`. Labels come from:
- The enrollment token's `default_labels` (set when you create the token)
- The supervisor's `non_identifying_attributes` config
- The collector's own `service.name` and `service.version`

Labels are used to match config templates to agents. If you want agents in `environment=prod` to get a different config than `environment=staging`, you create separate templates with label selectors."

**Kubernetes Deployment:**
```yaml
# DaemonSet for agent mode in Kubernetes
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: otel-collector
spec:
  selector:
    matchLabels:
      app: otel-collector
  template:
    spec:
      containers:
        - name: supervisor
          image: ghcr.io/open-telemetry/opamp-supervisor:latest
          volumeMounts:
            - name: supervisor-config
              mountPath: /etc/supervisor
          env:
            - name: ENROLLMENT_TOKEN
              valueFrom:
                secretKeyRef:
                  name: xscaler-enrollment
                  key: token
      volumes:
        - name: supervisor-config
          configMap:
            name: supervisor-config
```

---

### 4.3 Agent Registration (15 min)

**Session Objectives:**
- Participants can verify agent enrollment in the portal
- Participants can troubleshoot registration issues

**Demo Instructions:**
1. Navigate to `/agents` in the portal
2. Show the agent list — status (enrolled/online/offline), type, version, hostname, labels
3. Click on an agent — show detailed view: effective config, delivery history, health

**Validation Commands:**
```bash
# Check agent-api logs
docker logs xscaler-agent-api-1 | grep "agent enrolled\|agent online"

# Check agent connectivity (from supervisor host)
curl -i http://localhost:8082/healthz

# Check supervisor logs
journalctl -u otel-supervisor -f
# Look for: "Connected to OpAMP server" and "RemoteConfig applied"
```

---

### 4.4 Configuration Management (20 min)

**Session Objectives:**
- Participants can create and deploy config templates
- Participants understand revision history and rollback
- Participants can use secrets in configs

**Config Template Management:**

"A config template is a YAML document — an OTel Collector configuration. You create it in the portal at `/agents/config`. The portal stores the template in Postgres with revision history."

**Creating a template (Portal UI):**
1. Navigate to `/agents/config`
2. Click "New Template"
3. Enter name (e.g., `prod-metrics-collector`)
4. Write the OTel Collector YAML
5. Save — creates revision 1

**Config with Secrets:**
```yaml
exporters:
  prometheusremotewrite:
    endpoint: https://euw1-01.m.xscalerlabs.com/api/v1/push
    headers:
      Authorization: Bearer ${secret:xscaler_api_key}
      X-Scope-OrgID: ${secret:xscaler_tenant_id}
```

"The `${secret:name}` syntax references a secret stored in xScaler (encrypted with AWS KMS). The secret is injected at delivery time — it never appears in the portal UI or the database in plaintext. The agent receives the resolved config, but the portal only shows you the template with the secret reference."

**Label Selectors for Assignments:**
```json
{
  "matchLabels": {
    "environment": "production"
  }
}
```
This assigns the template to all agents with label `environment=production`.

**Config Rollback:**
```bash
# List template revisions via API
GET /agents/configs/{template_id}/revisions

# Assign an older revision
PUT /agents/configs/{template_id}/assignments
{
  "revision": 2  # roll back to revision 2
}
```

"When you update an assignment, portal-api triggers a Postgres `NOTIFY` on the `agent_config_changed` channel. All connected agent-api instances receive this notification immediately and push the new config to affected agents within seconds."

---

## SESSION 5: Grafana Integration (90 min)

### 5.1 Grafana Overview (15 min)

**Talking Points:**

"Grafana is the standard open-source visualisation layer for the LGTM stack. xScaler uses Grafana as the UI for:
- Querying and visualising metrics (with PromQL)
- Searching and visualising logs (with LogQL)
- Exploring traces (with TraceQL)
- APM dashboards (correlating all three signals)
- Alerting"

---

### 5.2 Deployment Options (20 min)

**Self-Hosted Grafana:**
- Customer manages their own Grafana instance (cloud, VM, or Kubernetes)
- Customer configures datasources manually pointing to xScaler endpoints
- Full control over Grafana version, plugins, SSO, LDAP
- xScaler provides the backend only

**xScaler Managed Grafana:**
- xScaler provisions and manages a dedicated Grafana instance per organisation
- Runs in the edge cluster close to your data
- Billed by pod-hour ($0.04/pod-hour, minimum 2 replicas)
- Updates, backups, and scaling handled by xScaler

[Show Diagram I — managed Grafana provisioning flow]

"The provisioner runs in the edge cluster as a Kubernetes Job. It polls `portal-api` for the desired state of managed Grafana instances, creates Helm releases and Postgres databases for each, then reports back the phase (provisioning → ready → failed)."

---

### 5.3 Datasource Configuration (55 min)

[*This is demo-heavy. Have a working local dev stack running.*]

**Demo: Configure Metrics Datasource**

1. Navigate to Grafana at `http://localhost:3001` (admin/admin in local dev)
2. Go to Connections → Datasources → Add Datasource
3. Select "Prometheus"
4. URL: `http://localhost:8080` (Envoy metrics port)
5. Add Custom HTTP Headers:
   - `Authorization`: `Bearer sk_load_xs_tnt_q4v7m2k5r3t6d2n4p5h7`
   - `X-Scope-OrgID`: `xs_tnt_q4v7m2k5r3t6d2n4p5h7`
6. Click "Save & Test" — should return "Data source connected"

[Show the provisioned datasource YAML from the repository]:
```yaml
# deploy/observability/grafana/provisioning/datasources/datasource.yml
datasources:
  - name: "Tenant: system-monitoring (system-mimir)"
    type: prometheus
    url: http://system-mimir:9009/prometheus
    jsonData:
      httpHeaderName1: X-Scope-OrgID
    secureJsonData:
      httpHeaderValue1: "system-monitoring"
```

**Demo: Configure Logs Datasource**

1. Add Datasource → Loki
2. URL: `http://localhost:8181` (Envoy logs port)
3. Custom HTTP Headers:
   - `Authorization`: `Bearer <token>`
   - `X-Scope-OrgID`: `xs_tnt_q4v7m2k5r3t6d2n4p5h7`
4. Save & Test

**Demo: Configure Traces Datasource**

1. Add Datasource → Tempo
2. URL: `http://localhost:8282` (Envoy traces port)
3. Custom HTTP Headers:
   - `Authorization`: `Bearer <token>`
   - `X-Scope-OrgID`: `xs_tnt_q4v7m2k5r3t6d2n4p5h7`
4. Save & Test

**Validate Data Ingestion:**
```bash
# Check metrics are being ingested
curl -s -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "http://localhost:8080/api/v1/query?query=up" | jq '.data.result | length'

# Check logs are being ingested  
curl -s -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "http://localhost:8181/loki/api/v1/query?query={job%3D\"loadgen\"}" | jq

# Check traces
curl -s -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "http://localhost:8282/api/search?limit=5" | jq
```

---

## SESSION 6: Dashboards, APM, and Alerting (90 min)

### 6.1 Dashboard Creation (30 min)

**Demo: Create First Metrics Dashboard**

1. Grafana → New Dashboard → Add Visualisation
2. Select Prometheus datasource
3. Query: `rate(http_requests_total[5m])`
4. Visualisation: Time series
5. Show labelling, colours, axis settings
6. Add second panel: `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))`
7. Save dashboard

**Visualisation Best Practices:**
- Use **Time Series** for metrics over time
- Use **Stat** panels for single current values (CPU %, error rate)
- Use **Table** for ranking (top 10 slowest endpoints)
- Use **Heatmap** for request duration distributions
- Always add a **Threshold** line for SLOs (e.g., p99 < 500ms in red)

---

### 6.2 Application Performance Monitoring (30 min)

**The APM Workflow — Root Cause Analysis:**

"Let's say your on-call engineer gets an alert at 2am. Error rate on `/api/checkout` is 5%. Here's the workflow:"

**Step 1 — Metrics dashboard:**
```promql
# Error rate for checkout service
sum(rate(http_requests_total{service="checkout", status=~"5.."}[5m]))
/ sum(rate(http_requests_total{service="checkout"}[5m]))
```
"We can see the error rate spiked at 01:47 and is still elevated."

**Step 2 — Jump to Logs:**
"In Grafana Explore, switch to the Loki datasource."
```logql
{service="checkout"} |= "error" | json | line_format "{{.level}}: {{.message}}"
```
"We see `Connection refused: database host checkout-db:5432` repeated hundreds of times."

**Step 3 — Check service metrics:**
```promql
# Database connection pool exhaustion
go_sql_db_open_connections{service="checkout-db"}
```
"Connection pool is at max (100/100). Something is holding connections."

**Step 4 — Trace a specific failing request:**
"In Explore, switch to Tempo. Search for traces from `checkout` service with status=error and duration > 1s."
"Click on a trace — we can see the DB connection span is waiting 30+ seconds. Root cause: a slow query blocking the pool."

**Demo: Grafana Correlations**
Show how Grafana links metrics → logs → traces via the trace ID in log lines.

---

### 6.3 Alerting (30 min)

**Alerting Concepts:**

"Grafana alerting has three components:
1. **Alert Rules** — PromQL/LogQL queries that evaluate on a schedule
2. **Contact Points** — where alerts are sent (email, Slack, PagerDuty, webhooks)
3. **Notification Policies** — routing rules (which alerts go to which contact points)"

**Demo: Create Alert Rule**

1. Alerting → Alert Rules → New Alert Rule
2. Rule name: "High Error Rate"
3. Query A:
   ```promql
   sum(rate(http_requests_total{status=~"5.."}[5m])) 
   / sum(rate(http_requests_total[5m]))
   ```
4. Condition: `IS ABOVE 0.05` (5% threshold)
5. Evaluation interval: every 1m, for 2m (fires after 2 consecutive evaluations)
6. Contact point: email / Slack
7. Annotations: Summary=`High error rate on {service}`, Runbook=`https://wiki.example.com/runbook/errors`

**Alert Tuning:**
- **Avoid alert fatigue** — set meaningful thresholds, not just any deviation
- **Use pending periods** — `FOR 5m` avoids firing on transient spikes
- **Group related alerts** — don't create 50 individual alerts, use recording rules
- **Add runbook links** — on-call engineers need context, not just numbers
- **Test silences** — know how to mute during maintenance windows

---

## SESSION 7: Hands-On Lab and Q&A (150 min)

### Full Lab Exercise

[See separate Hands-on Lab Guide (06_hands_on_labs.md) for step-by-step instructions]

**Trainer's Role During Lab:**
- Circulate and assist individual groups
- Watch for common issues (see Troubleshooting Guide)
- At 60 and 120 minutes, do a group check-in to address common blockers
- Ensure everyone completes at least steps 1-4 (tenant + agent + registration)
- Steps 5-8 (Grafana) can be partially completed for time

---

## WRAP-UP (30 min)

### Best Practices Summary

"Let's close with the most important best practices:"

1. **Always use dedicated API keys per environment** — never share one key across prod and staging. If it's compromised, you can revoke it without impacting other environments.

2. **Separate enrollment tokens per team** — set a `max_uses` limit and rotate tokens regularly.

3. **Use the OpAMP label selector** — create separate config templates for different environments or teams. Don't deploy one-size-fits-all configs.

4. **Monitor your own monitoring** — check the xScaler portal dashboard regularly. Set up alerts for approaching plan limits (xScaler emails at 80% by default).

5. **Design for cardinality** — high-cardinality labels (user_id, request_id in metric labels) will explode your active series count. Use logs and traces for per-request data.

6. **Set retention to match your needs** — don't store 90 days of data if your debugging only needs 14 days. Shorter retention = lower cost.

7. **Test your rollback procedure** — know how to roll back a config template. The revision history makes this safe.

8. **Use structured logging** — JSON logs are easier to query with LogQL. Add standard fields: `trace_id`, `span_id`, `service`, `level`.

---

### Q&A Guidance

**Common Questions and Answers:**

Q: "What happens if my OTel collector goes offline? Do I lose data?"
A: "The collector has retry buffers that hold data in memory (and optionally to disk with the `filestorage` extension) while the backend is unavailable. For very long outages, data can be lost unless you use a persistent queue. The key is to monitor the collector itself — use the `self-monitoring` pipeline to track its own drop rate."

Q: "Can I use Prometheus directly (not the OTel collector)?"
A: "Yes. Prometheus's `remote_write` config sends directly to xScaler's metrics endpoint. You just need to add the `Authorization` and `X-Scope-OrgID` headers to your remote_write config."

Q: "How do I handle network proxies / firewalls?"
A: "The only outbound connections needed from your infrastructure are to the xScaler endpoints (HTTPS 443 for REST, WSS 443 for OpAMP WebSocket). No inbound connections from xScaler to your network are required. The OpAMP supervisor initiates the connection outbound."

Q: "Is data encrypted in transit and at rest?"
A: "Yes. All connections to xScaler endpoints use TLS (HTTPS/WSS). Data at rest in S3 uses AWS server-side encryption (SSE-S3). Agent config secrets are envelope-encrypted with AWS KMS before storage."

Q: "What's the SLA for the platform?"
A: "[Refer to your specific SLA documentation. The architecture is designed for high availability with replicated components across AZs.]"

Q: "Can I export data OUT of xScaler?"
A: "Yes — Grafana's query API is standard Prometheus/Loki/Tempo compatible. You can use any Prometheus-compatible client to query the metrics API. You can also set up OTel collectors to forward data to additional backends simultaneously."
