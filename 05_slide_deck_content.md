# xScaler Observability Platform
# PowerPoint Slide Deck Content
## Complete Slide-by-Slide Specification

---

## How to Use This Document

Each slide is formatted as:
- **Slide Title** — the heading displayed on the slide
- **Objectives/Key Points** — bullet points visible on the slide
- **Speaker Notes** — detailed talking points for the presenter (not shown to participants)
- **Visual** — description of the diagram or image to create

---

# DECK 1: SESSION 1 — Platform Introduction and User Management

---

### SLIDE 1-01 — Title Slide

**Title:** xScaler Observability Platform  
**Subtitle:** Administrator & DevOps Training  
**Sub-subtitle:** 2-Day Instructor-Led Programme

**Speaker Notes:**  
Welcome participants. Introduce yourself — your background and experience with the platform. Set expectations: this is a 2-day practical training. By day 2, participants will have hands-on experience with the full stack.

**Visual:** xScaler logo, xScaler observability stack component logos (Mimir, Loki, Tempo, Grafana)

---

### SLIDE 1-02 — Training Agenda

**Title:** 2-Day Training Agenda

**Day 1:**
- Session 1: Platform Introduction & User Management
- Session 2: OpenTelemetry Fundamentals  
- Session 3: Data Collection Architecture
- Session 4: Tenant Setup & Agent Deployment

**Day 2:**
- Session 5: Grafana Integration
- Session 6: Dashboards, APM & Alerting
- Session 7: Hands-On Lab & Q&A

**Speaker Notes:**  
Walk through the agenda. Mention that each session has hands-on components. Labs build progressively — by Session 7, participants will have a complete working setup.

**Visual:** Two-column layout with Day 1 and Day 2 content, icons for each session topic

---

### SLIDE 1-03 — Platform Overview

**Title:** What is xScaler?

**Key Points:**
- Multi-tenant SaaS Observability Platform
- Metrics, Logs, and Traces as a managed service
- Built on xScaler's telemetry backends (xLogs, Grafana, xTraces, xMetrics)
- No infrastructure to manage — use your data, not your time
- Pay for what you use — metered billing

**Speaker Notes:**  
Position xScaler as the managed alternative to running your own Prometheus/Loki/Tempo stack. Emphasise the value: no patching, no capacity planning for the backend, no storage management. Customers focus on using observability data, not maintaining the stack.

**Visual:** Split diagram showing "Self-managed" (complex, many components, ops burden) vs "xScaler" (simple API endpoints, portal UI, managed backends)

---

### SLIDE 1-04 — Platform Architecture — High Level

**Title:** Platform Architecture

**Speaker Notes:**  
Walk through Diagram A from the architecture diagrams document. Point to each component. Emphasise the control plane / data plane separation. Spend 2-3 minutes on this — set the mental model before going into details.

**Key callouts:**
- "portal-web is the UI your team uses for management"
- "agent-api handles OTel collector config distribution"
- "All customer data goes through Envoy + proxy-auth first — this is the security layer"
- "Mimir, Loki, Tempo are industry-standard open-source backends"

**Visual:** Architecture Diagram A (High-Level Platform Architecture) from architecture_diagrams.md

---

### SLIDE 1-05 — Control Plane vs Data Plane

**Title:** Two Distinct Planes

**Control Plane:**
- portal-web (UI)
- portal-api (REST API)
- agent-api (OpAMP server)
- PostgreSQL (control state)

**Data Plane (per region):**
- Envoy (gateway)
- proxy-auth (auth enforcement)
- Mimir (metrics)
- Loki (logs)
- Tempo (traces)

**Speaker Notes:**  
The control plane handles MANAGEMENT operations. The data plane handles DATA. They are designed to be independent — if the control plane has a brief outage, your metrics/logs/traces continue flowing through the data plane. New tenants can't be created during a control plane outage, but existing tenants keep working.

**Visual:** Two-box diagram, one labelled "Control Plane" and one labelled "Edge Data Plane", with arrows showing: user management flows through control plane, telemetry flows through data plane

---

### SLIDE 1-06 — Multi-Tenancy: The X-Scope-OrgID Header

**Title:** Tenant Isolation — How It Works

**The Isolation Key:**
```
X-Scope-OrgID: xs_acme_ab3cd4ef
```

**Applied consistently to:**
- Mimir (metrics storage)
- Loki (log storage)
- Tempo (trace storage)
- All query responses

**You can ONLY access your own tenant's data**

**Speaker Notes:**  
This is the most important architectural concept. Every piece of data in the entire platform is namespaced by this one header. proxy-auth validates that the Bearer token's API key belongs to the tenant ID in the header — no cross-tenant access is possible. This is enforced in the proxy layer, not just the application layer.

**Visual:** Flow diagram showing request with X-Scope-OrgID header flowing through Envoy → proxy-auth → Mimir, with a lock icon at proxy-auth

---

### SLIDE 1-07 — User Roles and Permissions

**Title:** Role-Based Access Control

| Role | Who | Permissions |
|---|---|---|
| Owner | Org founder | Full access + billing + delete org |
| Admin | Team leads | Tenants, API keys, settings, members |
| Member | Engineers | View usage, manage own keys |

**Best Practice:**
- One owner per org
- Admins for team leads
- Members for developers

**Speaker Notes:**  
Roles are enforced server-side in portal-api middleware. It's not just a UI restriction. Emphasise that the owner role is sensitive — only one person should hold it, and it should be rotated if that person leaves.

**Visual:** Pyramid diagram showing Owner → Admin → Member hierarchy

---

### SLIDE 1-08 — The Three Signals

**Title:** Metrics, Logs, and Traces

**Metrics:** Numbers over time
- CPU: 78%
- Requests/sec: 1,240
- Error rate: 0.3%

**Logs:** Event records
- `ERROR payment: connection refused 192.168.1.5:5432`
- `INFO checkout: order_id=789 amount=42.99 processed`

**Traces:** Request journeys
- `/checkout` → `inventory` (50ms) → `payment` (250ms) → total 320ms

**Speaker Notes:**  
Use simple, concrete examples. Metrics answer "how much / how many." Logs answer "what happened and when." Traces answer "where did the time go?"

**Visual:** Three panels side by side — a time-series graph (metrics), a log line viewer (logs), and a distributed trace waterfall (traces)

---

### SLIDE 1-09 — The Debugging Workflow

**Title:** Using All Three Signals Together

```
[Alert: checkout error rate 5%]
        ↓
[Metrics: spike started 14:20]
        ↓  
[Logs: "database connection timeout"]
        ↓
[Traces: DB span taking 30s]
        ↓
[Root cause: slow query]
```

**Speaker Notes:**  
Walk through a real-world scenario. This workflow — metrics for detection, logs for investigation, traces for root cause — is the gold standard of modern observability. xScaler makes this possible because all three signals share the same tenant isolation and can be correlated in Grafana.

**Visual:** Funnel/waterfall diagram showing the investigation narrowing from alert → metrics → logs → traces → root cause

---

# DECK 2: SESSION 2 — OpenTelemetry Fundamentals

---

### SLIDE 2-01 — What is OpenTelemetry?

**Title:** OpenTelemetry — The Universal Telemetry Standard

**Key Points:**
- CNCF graduated project (2023)
- Vendor-neutral instrumentation standard
- One SDK, any backend
- Covers all three signals: Metrics, Logs, Traces
- Native OTLP support in xScaler

**Speaker Notes:**  
Before OTel, every vendor had proprietary agents. OTel changed this. Your team instruments once, and you can send to xScaler, Datadog, Prometheus, Jaeger — or all of them simultaneously. xScaler accepts OTLP natively, so no translation layer is needed.

**Visual:** OTel logo, with arrows showing: App → OTLP Protocol → Multiple backends (xScaler, Prometheus, Datadog, Jaeger)

---

### SLIDE 2-02 — OTel Collector Architecture

**Title:** OpenTelemetry Collector — The Data Pipeline

```
[Receivers] → [Processors] → [Exporters]
                    ↕
              [Extensions]

Combined into → [Pipelines]
  - metrics
  - logs
  - traces
```

**Speaker Notes:**  
The collector is a standalone binary. It's not in your application — it runs alongside it. Each component type has a specific role. Spend time on the pipeline concept — one receiver can feed multiple pipelines, one exporter can be used in multiple pipelines.

**Visual:** Flow diagram: Receivers (OTLP, Prometheus, hostmetrics) → Processors (memory_limiter, batch) → Exporters (prometheusremotewrite, otlphttp/loki)

---

### SLIDE 2-03 — Receivers

**Title:** Receivers — Getting Data In

**Common Receivers:**

| Receiver | Data Source | Protocol |
|---|---|---|
| `otlp` | Apps with OTel SDK | gRPC :4317 / HTTP :4318 |
| `prometheus` | `/metrics` endpoints | HTTP scrape |
| `hostmetrics` | CPU, memory, disk | System |
| `filelog` | Log files | File I/O |
| `k8scluster` | Kubernetes state | K8s API |

**Speaker Notes:**  
Receivers are how you get data into the collector. If your app uses Prometheus format, use the `prometheus` receiver. If it's OTel SDK, use the `otlp` receiver. You can have multiple receivers in one collector — it collects from all of them simultaneously.

**Visual:** Multiple source icons (app, server, k8s cluster) pointing arrows into a "Receiver" box

---

### SLIDE 2-04 — Processors

**Title:** Processors — Transforming Data in Flight

**Key Processors:**

```yaml
processors:
  memory_limiter:     # Prevent OOM
    limit_mib: 256
  batch:              # Group for efficiency
    timeout: 5s
  resourcedetection:  # Add cloud metadata
    detectors: [ec2, k8s]
  attributes:         # Add/rename/delete
    actions:
      - key: environment
        value: production
        action: insert
```

**Speaker Notes:**  
Processors are optional but powerful. `memory_limiter` and `batch` are almost always used — memory_limiter prevents the collector from crashing under load, and batch improves throughput by grouping data. `resourcedetection` is extremely valuable in cloud environments — it automatically adds `cloud.region`, `cloud.provider`, `host.name`, etc. to every metric.

**Visual:** Data flowing through a pipeline with transformation icons at each processor stage

---

### SLIDE 2-05 — Exporters

**Title:** Exporters — Sending Data Out

**For xScaler:**

```yaml
exporters:
  prometheusremotewrite:
    endpoint: https://euw1-01.m.xscalerlabs.com/api/v1/push
    headers:
      Authorization: Bearer ${env:API_KEY}
      X-Scope-OrgID: ${env:TENANT_ID}

  otlphttp/logs:
    endpoint: https://euw1-01.l.xscalerlabs.com
    headers:
      Authorization: Bearer ${env:API_KEY}
      X-Scope-OrgID: ${env:TENANT_ID}

  otlphttp/traces:
    endpoint: https://euw1-01.t.xscalerlabs.com
    headers:
      Authorization: Bearer ${env:API_KEY}
      X-Scope-OrgID: ${env:TENANT_ID}
```

**Speaker Notes:**  
Walk through each exporter. Note that each one includes the API key AND the tenant ID as HTTP headers. These are the two pieces of information that identify and authenticate your data. The `${env:API_KEY}` syntax reads from environment variables — never hardcode credentials in YAML files.

**Visual:** Collector box with three export arrows pointing to Mimir, Loki, Tempo icons

---

### SLIDE 2-06 — Agent vs Gateway Mode

**Title:** Choosing Your Deployment Model

| Factor | Agent Mode | Gateway Mode |
|---|---|---|
| Complexity | Low | Medium |
| SPOF risk | None | Gateway is critical path |
| Enrichment | Per-agent | Centralised |
| Best for | VM fleets, DaemonSets | Multi-tenant, fan-in |
| xScaler config | OpAMP managed | Manual or OpAMP |

**Recommendation:** Start with Agent Mode — simpler and fully managed via OpAMP

**Speaker Notes:**  
For most xScaler customers, Agent Mode with OpAMP management is the best starting point. The platform's OpAMP support makes Agent Mode just as manageable as Gateway Mode, without the single point of failure risk. Gateway Mode adds value when you need centralised enrichment or are forwarding from many apps behind a shared tenant.

**Visual:** Side-by-side diagrams of Agent Mode and Gateway Mode architectures

---

# DECK 3: SESSION 3 — Data Collection Architecture

---

### SLIDE 3-01 — Pull vs Push Collection

**Title:** Two Ways to Collect Metrics

**Pull (Prometheus model):**
```
[Prometheus Receiver] → [scrapes] → [/metrics endpoint on your app]
Every 60 seconds
```

**Push (OTLP model):**
```
[Your app / OTel SDK] → [OTLP push] → [Receiver]
On your schedule
```

**When to use pull:** Existing Prometheus apps, service discovery needed  
**When to use push:** Short-lived jobs, OTLP-native apps

**Visual:** Two diagrams side by side showing pull (collector initiates) vs push (app initiates)

---

### SLIDE 3-02 — The Authentication Flow

**Title:** How Every Request is Authenticated

```
[App] → POST /api/v1/push
        Authorization: Bearer xag_abc123
        X-Scope-OrgID: xs_acme_ab3cd4ef
                ↓
[Envoy] gRPC Check() → [proxy-auth]
                ↓
[proxy-auth] SHA256 hash token
             → Portal-API snapshot lookup
             ← {authorized, plan, limits}
             Cache 10s
                ↓
[Envoy] Forwards to Mimir with injected headers
```

**Speaker Notes:**  
Walk through each step. Emphasise that the Bearer token hash is looked up in the database — the plaintext is never stored. The 10-second cache means the snapshot is not looked up on every single request. This is important for performance — a high-throughput collector sends many requests per second.

**Visual:** Sequence diagram of the authentication flow (derived from Diagram D)

---

### SLIDE 3-03 — Rate Limiting and Plan Enforcement

**Title:** How Plans Are Enforced

**Free Plan:**
- Hard cap: 20,000 active time series
- Hard cap: 50 GB logs per month
- Over limit: HTTP 429

**Scale Plan:**
- 20k series included in $19 base
- Metered above: $0.001428/series-month
- No hard cap on series

**Enforcement point:** proxy-auth + Mimir/Loki limits

**Visual:** Dial/gauge showing 80% warning and 100% hard cap zones, with traffic light (green/amber/red) indicators

---

# DECK 4: SESSION 4 — Tenant Setup and Agent Deployment

---

### SLIDE 4-01 — Tenant Concepts

**Title:** What is a Tenant?

- An isolated data silo for one environment/application
- Has a unique ID: `xs_acme_ab3cd4ef`
- Gets dedicated endpoints (metrics, logs, traces)
- Has its own API keys
- Is part of one Organisation

**Best Practice:** One tenant per environment (prod/staging/dev)

**Visual:** Organisation box containing multiple Tenant boxes with different labels (prod, staging, dev)

---

### SLIDE 4-02 — Creating a Tenant

**Title:** Tenant Creation — API

```bash
curl -X POST https://portal.xscalerlabs.com/tenants \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Production",
    "environment": "prod"
  }'

# Response
{
  "id": "xs_acme_ab3cd4ef",
  "metrics_host": "euw1-01.m.xscalerlabs.com",
  "logs_host": "euw1-01.l.xscalerlabs.com"
}
```

**Visual:** Code slide with syntax highlighting

---

### SLIDE 4-03 — OpAMP Agent Management

**Title:** Zero-Touch Agent Configuration with OpAMP

**Traditional approach:**
1. SSH to each machine
2. Edit config file
3. Restart service
4. Repeat × N machines

**xScaler OpAMP approach:**
1. Create config template in portal
2. Set label selector
3. Platform pushes to ALL matching agents instantly

**Speaker Notes:**  
This is a key differentiator. For 5 agents, manual config management is fine. For 50 agents, it becomes painful. For 500, it's impossible without automation. OpAMP makes the config management problem disappear — you update one template, and all agents update automatically within seconds.

**Visual:** Comparison diagram — left side shows manual SSH/config approach with many arrows to many servers, right side shows single portal update with automatic distribution to multiple agents

---

### SLIDE 4-04 — OpAMP Enrollment Flow

**Title:** How an Agent Enrolls

```
[1] Agent starts with enrollment token (xse_...)
[2] Connects to wss://agents.xscalerlabs.com/v1/opamp
[3] agent-api validates token, creates agent record
[4] agent-api mints per-agent key (xag_...)
[5] Agent receives per-agent key (enrollment done)
[6] Agent reconnects with xag_ key (authenticated)
[7] Agent receives config template (RemoteConfig)
[8] Supervisor restarts otelcol-contrib with new config
[9] Agent reports back: APPLIED
```

**Visual:** Diagram F (Configuration Management Flow) simplified to show enrollment steps only

---

### SLIDE 4-05 — Config Templates and Secrets

**Title:** Secrets in Config Templates

**Template body (stored in portal):**
```yaml
exporters:
  prometheusremotewrite:
    headers:
      Authorization: Bearer ${secret:api_key}
      X-Scope-OrgID: ${secret:tenant_id}
```

**Secret values (encrypted with AWS KMS):**
- `api_key` → `xag_abc123...`
- `tenant_id` → `xs_acme_ab3cd4ef`

**Secrets are injected at delivery time — never stored in plaintext**

**Visual:** Flow showing template with `${secret:x}` → KMS decrypt → resolved config sent to agent → redacted config stored in portal

---

### SLIDE 4-06 — Config Rollback

**Title:** Safe Configuration Rollback

**Every template save creates an immutable revision:**
- Revision 1 → deployed Monday (config_hash: abc123)
- Revision 2 → deployed Tuesday (config_hash: def456) ← current
- Revision 3 → deployed Wednesday (config_hash: ghi789) ← breaking

**To roll back:**
1. Navigate to template → revisions
2. Select revision 2
3. Assign revision 2 to agents
4. Platform pushes rollback within seconds

**Agent delivery history tracks:** offered → applying → applied/failed

**Visual:** Timeline showing revisions 1→2→3, with a rollback arrow from 3 back to 2

---

# DECK 5: SESSION 5 — Grafana Integration

---

### SLIDE 5-01 — Grafana as the Visualization Layer

**Title:** Grafana — The Unified Observability UI

**Works with all three xScaler signals:**
- Metrics → Prometheus datasource → PromQL
- Logs → Loki datasource → LogQL
- Traces → Tempo datasource → TraceQL

**Three deployment options:**
- Self-hosted Grafana
- xScaler Managed Grafana
- Grafana Cloud (with xScaler as backend)

**Visual:** Grafana logo with three data source connection arrows to Mimir, Loki, Tempo

---

### SLIDE 5-02 — Self-Hosted vs Managed Grafana

**Title:** Grafana Deployment Options

| | Self-Hosted | Managed (xScaler) |
|---|---|---|
| Setup | Manual | Automatic |
| Maintenance | Your team | xScaler |
| SSO config | Your responsibility | Managed |
| Cost | Your infra costs | $0.04/pod-hour |
| Control | Full | Limited customisation |
| Plugins | Any | Standard set |

**Recommendation:** Start with self-hosted for testing, consider Managed for production

**Visual:** Two boxes with pros/cons for each option

---

### SLIDE 5-03 — Datasource Configuration

**Title:** Connecting Grafana to xScaler

**Required headers for every datasource:**
```yaml
Authorization: Bearer xag_<your_api_key>
X-Scope-OrgID: xs_acme_ab3cd4ef
```

**Why two headers?**
- `Authorization` → proves you have permission
- `X-Scope-OrgID` → selects which tenant's data to view

**Speaker Notes:**  
Emphasise that BOTH headers are required. Without Authorization, the request is rejected (401). Without X-Scope-OrgID, the proxy-auth rejects it or routes to anonymous. Both must match — the API key must belong to the tenant ID in the header.

**Visual:** Grafana datasource config screenshot mockup showing both custom headers

---

# DECK 6: SESSION 6 — Dashboards, APM, and Alerting

---

### SLIDE 6-01 — Dashboard Design Principles

**Title:** Building Effective Dashboards

**Top-down structure:**
1. Overview: SLO status, error rates, traffic
2. Service-level: per-service latency, errors
3. Instance-level: CPU, memory, connections

**Right panel for right data:**
- Time Series → trends
- Stat → current values
- Table → rankings
- Heatmap → distributions

**Visual:** Example dashboard layout mockup showing hierarchy of panels from overview to detail

---

### SLIDE 6-02 — APM Correlation Workflow

**Title:** Correlating Metrics, Logs, and Traces

```
[Metrics alert: error rate 5%]
    ↓ Click "Explore logs"
[Logs: search for error messages]
    ↓ Click on log line with trace_id
[Trace: waterfall view of the failing request]
    ↓ Identify slow span
[Root cause: DB query timeout]
```

**Speaker Notes:**  
Grafana has native correlation features when datasources are configured correctly. Exemplars in metrics link to traces. Log lines with trace_id fields link to Tempo. This workflow shortens MTTR dramatically because engineers don't have to switch between tools or copy/paste IDs.

**Visual:** Three-panel Grafana view showing correlated metrics (with exemplar), logs (with trace_id link), and trace waterfall

---

### SLIDE 6-03 — Alerting Architecture

**Title:** Grafana Alerting Components

**Alert Rules:**
- Query (PromQL/LogQL)
- Condition (threshold, no data, error)
- Evaluation schedule

**Contact Points:**
- Email
- Slack
- PagerDuty
- Webhooks

**Notification Policies:**
- Route alerts to contact points
- Based on labels/matchers
- Grouping, silence, inhibit

**Visual:** Three-component diagram showing Alert Rule → Notification Policy → Contact Point flow

---

### SLIDE 6-04 — Alert Best Practices

**Title:** Avoiding Alert Fatigue

**DO:**
- ✅ Set meaningful thresholds (p99 > SLO)
- ✅ Use `FOR` duration (avoid transient spikes)
- ✅ Add runbook links in annotations
- ✅ Group related alerts
- ✅ Test silences before maintenance

**DON'T:**
- ❌ Alert on every metric deviation
- ❌ Fire immediately without pending period
- ❌ Page at 3am for non-critical issues
- ❌ Create 50 individual alerts instead of one smart rule

**Visual:** Two-column layout with DO/DON'T examples

---

# DECK 7: SESSION 7 — Hands-On Lab Summary

---

### SLIDE 7-01 — Lab Overview

**Title:** Hands-On Lab — Building Your Complete Setup

**Lab steps:**
1. ✅ Create a tenant
2. ✅ Create API keys
3. ✅ Deploy OTel agent via OpAMP enrollment
4. ✅ Create config template with secrets
5. ✅ Configure Grafana datasources (metrics/logs/traces)
6. ✅ Build a multi-signal dashboard
7. ✅ Create an alert rule
8. ✅ Validate all three signals are flowing

**Visual:** Checklist with step numbers, with icons for each step

---

### SLIDE 7-02 — Best Practices Summary

**Title:** Key Best Practices

1. **One API key per environment** — isolate blast radius
2. **Label your agents** — enables targeted config rollouts
3. **Set plan usage alerts** — watch for 80% warning emails
4. **Design for cardinality** — high-cardinality labels explode costs
5. **Structure your logs** — JSON logs are queryable
6. **Add trace IDs to logs** — enables correlation
7. **Test rollback procedures** — know how before you need it
8. **Monitor your monitoring** — check agent health regularly

**Visual:** Eight icons representing each best practice

---

### SLIDE 7-03 — Q&A and Resources

**Title:** Questions and Next Steps

**Resources:**
- xScaler Documentation: docs.xscalerlabs.com
- OpenTelemetry: opentelemetry.io
- Grafana Docs: grafana.com/docs
- Mimir Docs: grafana.com/docs/mimir
- Loki Docs: grafana.com/docs/loki

**Support:**
- Portal support tickets at Settings → Support
- Zoho Desk integration for enterprise customers
- Email alerts for plan threshold warnings (80%)

**Visual:** Resource links with logos, support contact information

---

## Presentation Design Notes

**Colour Palette:**
- Primary blue: #1F3A93 (xScaler brand)
- Accent orange: #F97316 (Grafana orange)
- Success green: #16A34A
- Warning amber: #D97706
- Error red: #DC2626
- Background: #F8FAFC (light grey)
- Text: #1E293B (dark)

**Typography:**
- Headings: Inter Bold
- Body: Inter Regular
- Code: JetBrains Mono

**Slide Master:**
- Header: xScaler logo top-right
- Footer: Session name + page number
- Left sidebar: Optional session progress indicator

**Animation guidance:**
- Minimal animations
- Appear on click for sequential items
- No complex animations that distract from content
