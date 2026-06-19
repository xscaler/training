# xScaler Observability Platform
# Best Practices Guide
**Production-Grade Patterns for Platform Administrators and SRE Teams**

---

## 1. Tenant and API Key Management

### 1.1 Tenant Naming and Organisation

**Best Practice:** One tenant per environment per application

```
Organisation: AcmeCorp
  ├── Tenant: xs_acme_prod    — production environment
  ├── Tenant: xs_acme_staging — staging environment  
  └── Tenant: xs_acme_dev     — development environment
```

**Why:** Separate tenants provide true data isolation. A misconfigured production push cannot accidentally pollute staging dashboards. Retention policies can differ per environment (30d dev, 90d prod).

**Naming convention for `display_name`:**
```
{AppName} {Environment}
e.g.: "PaymentService Production", "AuthAPI Staging"
```

**Environment field values:**
- `prod` — production
- `staging` — pre-production
- `dev` — development
- `test` — automated testing (consider short retention)
- Never use `loadgen` in production (reserved for the built-in load generator)

### 1.2 API Key Hygiene

**Best Practice: One API key per workload, not per team**

| ❌ Bad | ✅ Good |
|---|---|
| One shared key for all collectors | One key per collector deployment |
| Key named "dev-key" | Key named "k8s-prod-otel-daemonset" |
| Never rotating keys | Rotate annually or after personnel changes |
| Sharing keys via Slack | Use Kubernetes Secrets, HashiCorp Vault |

**Key rotation procedure:**
1. Create new key: `POST /tenants/{id}/keys`
2. Update collector config with new key
3. Deploy new config (verify collectors are using new key)
4. Revoke old key: `DELETE /tenants/{id}/keys/{key_id}`
5. Wait 15 seconds (proxy-auth cache TTL) before verifying old key is rejected

**Never:**
- Hardcode API keys in source code or config files committed to git
- Use the same key for dev and production environments
- Share API keys across organisation boundaries

---

## 2. OTel Collector Configuration

### 2.1 Always Include memory_limiter

```yaml
processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 256        # 75% of container memory limit
    spike_limit_mib: 64   # Burst headroom above limit_mib
```

**Why:** Without memory_limiter, a sudden spike in telemetry volume can OOM-kill your collector, causing data loss AND halting all metric collection until it restarts.

**Sizing guidance:**
- Container limit: 512 MiB → `limit_mib: 384`
- Container limit: 1 GiB → `limit_mib: 768`
- Container limit: 256 MiB → `limit_mib: 192`

### 2.2 Batch Processor Tuning

```yaml
processors:
  batch:
    timeout: 5s              # Max wait before sending a partial batch
    send_batch_size: 1024    # Max items per batch
    send_batch_max_size: 2048 # Absolute maximum (optional)
```

**For high-throughput environments:**
```yaml
  batch:
    timeout: 1s           # Lower timeout = lower latency
    send_batch_size: 8192 # Larger batches = higher throughput
```

**For low-volume environments:**
```yaml
  batch:
    timeout: 30s          # Wait longer to accumulate batch
    send_batch_size: 256  # Smaller batches acceptable
```

### 2.3 Resource Detection

Always add `resourcedetection` in cloud environments:

```yaml
processors:
  resourcedetection:
    detectors: [env, ec2, ecs, eks, gcp, azure, docker, system]
    timeout: 5s
    override: false   # Don't override explicitly set attributes
```

**This auto-adds:** `cloud.provider`, `cloud.region`, `host.id`, `host.name`, `k8s.cluster.name`, `k8s.node.name`

### 2.4 Attribute Management

**Add standard attributes:**
```yaml
processors:
  attributes:
    actions:
      - key: deployment.environment
        value: production
        action: upsert
      - key: service.namespace
        value: payment-platform
        action: upsert
```

**Remove sensitive or high-cardinality labels from metrics:**
```yaml
  attributes/metrics:
    actions:
      - key: user_id         # High cardinality — remove from metrics
        action: delete
      - key: request_id      # Move to logs/traces, not metrics
        action: delete
      - key: internal_token  # Sensitive — always remove
        action: delete
```

### 2.5 Cardinality Management

**The most important cost control lever.**

Active series count determines your Mimir billing. A single high-cardinality label can turn 100 series into 1,000,000 series.

**High-cardinality label examples (NEVER in metrics):**
- `user_id` — millions of unique values
- `request_id` / `trace_id` — unique per request
- `customer_id` — high cardinality in B2B SaaS
- `session_id` — unique per browser session

**Safe low-cardinality labels (OK in metrics):**
- `environment` (prod/staging/dev) — ~3 values
- `region` (us-east-1, eu-west-1) — ~10 values
- `service` (checkout, payment, auth) — ~20 values
- `pod` name in Kubernetes — can be many, monitor carefully
- `http_method` (GET/POST/PUT/DELETE) — ~4 values
- `http_status_code` (200/400/500) — group with `status_code` instead

**The `metric_relabel_configs` safety net:**
```yaml
# In OTel collector prometheus receiver:
metric_relabel_configs:
  - source_labels: [user_id]
    action: drop_label  # Remove user_id label from all metrics
```

---

## 3. Agent Management (OpAMP)

### 3.1 Enrollment Token Strategy

**Create separate enrollment tokens per fleet:**
```
Token: "production-kubernetes"    — for k8s DaemonSet agents
Token: "production-vms"          — for VM-based agents
Token: "staging-all"             — for all staging agents
Token: "ci-ephemeral"            — for CI agents (max_uses: 1000, expires: 30d)
```

**Default labels per token:**
```json
{
  "environment": "production",
  "deployment": "kubernetes",
  "team": "platform"
}
```

**Token security:**
- Set `max_uses` for non-infinite tokens
- Set `expires_at` for ephemeral environments
- Revoke tokens when a fleet is decommissioned
- Never embed enrollment tokens in public container images

### 3.2 Config Template Organisation

**One template per role, not one template per agent:**

```
Templates:
  "base-kubernetes-agent"    — core OTLP + hostmetrics + k8sattributes
  "base-vm-agent"            — OTLP + hostmetrics
  "java-service-agent"       — extends base with JVM metrics
  "postgres-agent"           — postgres receiver + base metrics
```

**Assignment priority:**
- Priority `0` = lowest (applies if nothing else matches)
- Priority `100` = highest (overrides lower-priority assignments)

```
Priority 0: {"matchLabels": {}}                   → base config for all agents
Priority 50: {"matchLabels": {"team": "backend"}} → backend-specific config
Priority 100: {"matchLabels": {"service": "db"}}  → DB-specific config
```

### 3.3 Secret Management

**Store secrets per environment, not per agent:**
```
Secrets:
  "prod_api_key"       → xag_ key for production tenant
  "prod_tenant_id"     → xs_acme_prod
  "staging_api_key"    → xag_ key for staging tenant
  "staging_tenant_id"  → xs_acme_staging
```

**Use secret references in templates:**
```yaml
# Template that works for both prod and staging
# (just change which secret is assigned to the name)
headers:
  Authorization: Bearer ${secret:api_key}
  X-Scope-OrgID: ${secret:tenant_id}
```

### 3.4 Config Rollout Strategy

**Test before fleet-wide rollout:**
1. Create new template revision
2. Create targeted assignment: `{"matchLabels": {"canary": "true"}}`
3. Label one agent as canary: update agent labels via portal
4. Verify canary agent: `applied` status + no errors for 15 minutes
5. Remove canary assignment, create fleet-wide assignment
6. Monitor delivery history for failures

---

## 4. Grafana Dashboard Design

### 4.1 Dashboard Hierarchy

**Recommended structure:**
```
Folder: Platform Overview
  Dashboard: Organisation Health      — SLO status, all tenants, top-level KPIs
  Dashboard: Cost and Usage           — active series, logs volume, billing trend

Folder: Service Dashboards
  Dashboard: {ServiceName} Overview   — request rate, error rate, latency
  Dashboard: {ServiceName} Detail     — per-endpoint breakdown

Folder: Infrastructure
  Dashboard: Kubernetes Overview      — node CPU/memory, pod restart count
  Dashboard: Database Health          — connections, query latency, cache hit rate

Folder: Operations
  Dashboard: Tenant Health Heatmap    — per-tenant error rate (colour matrix)
  Dashboard: Agent Fleet Health       — online/offline ratio, config delivery status
```

### 4.2 SLO-Driven Dashboards

**Structure each service dashboard around SLOs, not metrics:**

```
Panel row: "SLO Status"
  - Availability SLO: 99.9% (current: 99.97%) [Stat with green/red threshold]
  - Latency SLO: p99 < 500ms (current: 340ms) [Gauge]
  - Error rate SLO: < 1% (current: 0.3%) [Stat]

Panel row: "Traffic"
  - Request rate by endpoint [Time series]
  - Error rate by endpoint [Time series with threshold]

Panel row: "Latency"
  - p50, p90, p99 latency [Time series]
  - Latency heatmap [Heatmap]

Panel row: "Saturation"
  - CPU utilisation [Time series]
  - Memory utilisation [Time series]
  - Connection pool usage [Gauge]
```

### 4.3 Variable Best Practices

**Use dashboard variables for flexibility:**
```
Variable: tenant
  Type: Query
  Query: label_values(cortex_ingester_active_series, user)
  Used in panels: {user="$tenant"}

Variable: interval
  Type: Interval
  Values: 1m, 5m, 10m, 30m
  Used in panels: rate(metric[$interval])
```

### 4.4 Alert Rule Best Practices

**The four golden signals as alert rules:**

1. **Latency alert:**
   ```promql
   histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service="$svc"}[5m])) > 0.5
   ```
   For: 2m | Severity: warning

2. **Error rate alert:**
   ```promql
   sum(rate(http_requests_total{service="$svc", status=~"5.."}[5m]))
   / sum(rate(http_requests_total{service="$svc"}[5m])) > 0.01
   ```
   For: 2m | Severity: critical

3. **Traffic drop alert:**
   ```promql
   sum(rate(http_requests_total{service="$svc"}[5m])) < 0.1
   ```
   For: 5m | Severity: warning (may indicate upstream issues)

4. **Saturation alert:**
   ```promql
   (1 - avg(node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) > 0.85
   ```
   For: 5m | Severity: warning

---

## 5. Multi-Tenant Operations

### 5.1 Usage Monitoring

**Monitor approaching plan limits proactively:**

xScaler emails the org owner when any tenant reaches 80% of plan limits. To see current usage programmatically:

```bash
# Via portal-api
curl -s "$PORTAL_BASE/dashboard/org/summary" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '{
    active_series: .org_active_series,
    plan_limit: .plan_max_active_series,
    pct_used: (.org_active_series / .plan_max_active_series * 100)
  }'
```

**PromQL for usage trend (via Grafana with system-mimir datasource):**
```promql
# Track series growth over 7d
sum by (user) (cortex_ingester_active_series)
```

### 5.2 Tenant Lifecycle Management

**New tenant onboarding checklist:**
- [ ] Create tenant via portal (display_name matches your naming convention)
- [ ] Create at least 2 API keys (active + backup)
- [ ] Document tenant ID and endpoints in your runbook
- [ ] Configure OTel collector with tenant credentials
- [ ] Verify metrics appear in Grafana (query `up` within 5 minutes)
- [ ] Create baseline dashboard
- [ ] Create essential alert rules
- [ ] Share Grafana dashboard link with team

**Tenant offboarding checklist:**
- [ ] Revoke all API keys
- [ ] Update OTel collector to stop sending to this tenant
- [ ] Export any data you need (Grafana snapshots, metric CSV export)
- [ ] Contact xScaler support for tenant deletion (data retention period applies)
- [ ] Archive the tenant's Grafana dashboards and alert rules

### 5.3 Cross-Tenant Dashboards

**For platform admins who need visibility across all tenants:**

```promql
# Total active series across all tenants
sum by (user) (cortex_ingester_active_series)

# Top 10 tenants by ingestion rate
topk(10, sum by (user) (rate(cortex_distributor_received_samples_total[5m])))
```

*Note: Cross-tenant queries require the system-mimir datasource, not the client-mimir datasource. The system-mimir datasource uses the `system-monitoring` tenant which has visibility into all tenants' internal metrics.*

---

## 6. Performance and Scaling

### 6.1 Collector Sizing

**Memory:**
```
Recommended memory per collector = 
  (peak_events_per_second × average_event_size_bytes × batch_timeout_seconds) × 3
```

Example: 10,000 metrics/s × 200 bytes × 5s × 3 = ~30 MiB sustained, use 256 MiB limit

**CPU:**
- 0.1 vCPU per 1,000 metrics/second (rough guideline)
- Add 0.2 vCPU per compression stage (snappy, gzip)
- Add 0.5 vCPU per processor that does regex matching

### 6.2 Queue Configuration

**For production reliability, use a file-based queue:**

```yaml
exporters:
  prometheusremotewrite:
    endpoint: https://euw1-01.m.xscalerlabs.com/api/v1/push
    headers:
      Authorization: Bearer ${secret:api_key}
      X-Scope-OrgID: ${secret:tenant_id}
    # Retry configuration
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 30s
      max_elapsed_time: 300s
    # Queue configuration
    queue:
      enabled: true
      num_consumers: 10
      queue_size: 5000

extensions:
  file_storage:
    directory: /var/lib/otelcol/queue
    timeout: 10s

service:
  extensions: [file_storage]
```

*Note: file_storage requires the `filestorage` extension in otelcol-contrib.*

### 6.3 High Availability Agent Mode

**For critical production environments:**

```yaml
# Deploy 2 collectors per node group, both pushing to same tenant
# One is active, one is standby (no active-active needed for metrics — Mimir deduplicates)
# Just ensure both use the same X-Scope-OrgID tenant ID

# Alternative: single collector with restart policy
# Kubernetes DaemonSet guarantees exactly one collector per node
```

---

## 7. Security Best Practices

### 7.1 Network Security

**Outbound connections required from your infrastructure:**
- `euw1-01.m.xscalerlabs.com:443` — metrics (HTTPS)
- `euw1-01.l.xscalerlabs.com:443` — logs (HTTPS)
- `euw1-01.t.xscalerlabs.com:443` — traces (HTTPS)
- `agents.xscalerlabs.com:443` — OpAMP (WSS)

**No inbound connections required** — xScaler never initiates connections to your infrastructure.

**Firewall recommendations:**
```
Egress: allow TCP 443 to *.xscalerlabs.com
Ingress: deny all from xscalerlabs.com (not required)
```

### 7.2 Secret Storage

**Use your secret management system:**

```yaml
# Kubernetes Secret for API credentials
apiVersion: v1
kind: Secret
metadata:
  name: xscaler-credentials
  namespace: monitoring
type: Opaque
stringData:
  API_KEY: "xag_..."
  TENANT_ID: "xs_acme_prod"
---
# Reference in DaemonSet
env:
  - name: API_KEY
    valueFrom:
      secretKeyRef:
        name: xscaler-credentials
        key: API_KEY
  - name: TENANT_ID
    valueFrom:
      secretKeyRef:
        name: xscaler-credentials
        key: TENANT_ID
```

```yaml
# OTel collector referencing env vars
exporters:
  prometheusremotewrite:
    headers:
      Authorization: Bearer ${env:API_KEY}
      X-Scope-OrgID: ${env:TENANT_ID}
```

### 7.3 Audit and Compliance

**Portal activity tracking:**
- All portal actions are logged in the `activity` table
- Navigate to **Activity** in the portal for audit history
- Log data is also available via LogQL if logs are configured

**For GDPR / data residency:**
- xScaler edge clusters are region-specific
- EU data stays in `euw1-01` (eu-west-1 / Frankfurt)
- Create tenants only in your required region
- Contact xScaler for Data Processing Agreement (DPA)

---

## 8. Operational Runbooks

### 8.1 Daily Operations Checklist

```
□ Check portal dashboard: all tenants' active series within 90% of limit
□ Check agent fleet health: online ratio > 95%
□ Check alert rule status: no unexpected firing alerts
□ Check Grafana datasource health: all datasources connected
□ Review any new mimir-sync warnings in portal notifications
```

### 8.2 Weekly Operations Checklist

```
□ Review billing usage trend (growing faster than expected?)
□ Review cardinality: any tenants with suddenly increased series?
□ Review log volume: any services logging excessively?
□ Check agent config delivery history: any persistent failures?
□ Review alert fatigue: any alerts firing too frequently?
```

### 8.3 Monthly Operations Checklist

```
□ Review API key inventory: any old/unused keys?
□ Review team member access: any departed team members to remove?
□ Review retention settings: any environments with unnecessary long retention?
□ Review config templates: any outdated templates to clean up?
□ Review and test rollback procedure for each config template
□ Confirm backup API keys are still valid (create + test, don't assume)
```
