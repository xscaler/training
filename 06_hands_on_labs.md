# xScaler Observability Platform
# Hands-On Lab Guide
**Complete Exercise Instructions with Validation Steps**

---

## Lab Environment

**Prerequisite:** The full xScaler Docker Compose stack is running:
```bash
cd /Users/pathum.fernando/Projects/xscaler/xscaler
docker compose up -d
# Wait for all services to be healthy (~60-90 seconds)
docker compose ps  # All services should show "healthy" or "running"
```

**Environment variables — set these before starting labs:**
```bash
# These will be populated as you complete Lab 1
export PORTAL_BASE="http://localhost:8081"
export PORTAL_WEB="http://localhost:3000"
export GRAFANA="http://localhost:3001"
export METRICS_EDGE="http://localhost:8080"
export LOGS_EDGE="http://localhost:8181"
export TRACES_EDGE="http://localhost:8282"
```

---

## LAB 1: Account Setup and Tenant Creation

**Objective:** Create a login session, create a tenant, and generate API keys.

**Duration:** 30 minutes

### Step 1.1 — Sign Up and Login

```bash
# Sign up (creates organization + first user)
curl -s -X POST "$PORTAL_BASE/auth/signup" \
  -H 'Content-Type: application/json' \
  -d '{
    "org_name": "TrainingOrg",
    "email": "admin@training.local",
    "password": "TrainingPass123!"
  }' | jq

# Expected output:
# {
#   "token": "eyJhbGciOiJIUzI1NiI...",
#   "user": { "email": "admin@training.local", ... },
#   "org": { "name": "TrainingOrg", "public_id": "xs_org_..." }
# }

# Save the token
export JWT_TOKEN="eyJhbGciOiJIUzI1NiI..."  # paste your token here
```

**Validation:**
```bash
# Test the token works
curl -s "$PORTAL_BASE/tenants" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq
# Expected: {"tenants": []}  (empty list initially)
```

### Step 1.2 — Create a Tenant

```bash
# Create production tenant
curl -s -X POST "$PORTAL_BASE/tenants" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Training Production",
    "environment": "prod"
  }' | jq

# Expected output:
# {
#   "id": "xs_trainingorg_xxxxxxxx",
#   "display_name": "Training Production",
#   "environment": "prod",
#   "metrics_host": "localhost:8080",
#   "logs_host": "localhost:8181",
#   "status": "active"
# }

# Save tenant ID
export TENANT_ID="xs_trainingorg_xxxxxxxx"  # replace with your actual ID
```

**Validation:**
```bash
# List tenants to confirm creation
curl -s "$PORTAL_BASE/tenants" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.tenants[].id'
# Expected: "xs_trainingorg_xxxxxxxx"
```

### Step 1.3 — Create API Key

```bash
# Create API key for the tenant
API_KEY_RESPONSE=$(curl -s -X POST \
  "$PORTAL_BASE/tenants/$TENANT_ID/keys" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "training-collector"}')

echo $API_KEY_RESPONSE | jq

# Expected output:
# {
#   "id": "...",
#   "name": "training-collector",
#   "key": "xag_...",  ← SAVE THIS - shown only once!
#   "created_at": "2026-06-18T..."
# }

# Save the API key
export API_KEY=$(echo $API_KEY_RESPONSE | jq -r '.key')
echo "API Key saved: $API_KEY"
```

**⚠️ Important:** The `key` field in the response is the only time the plaintext API key is shown. Save it securely.

**Validation:**
```bash
# Test metrics access with the API key
curl -s "$METRICS_EDGE/api/v1/query?query=up" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" | jq '.status'
# Expected: "success"
```

**Lab 1 Checkpoint:** ✅ You have a tenant ID and working API key.

---

## LAB 2: OTel Agent Deployment and Registration

**Objective:** Create an enrollment token, seed local agents, and verify registration in the portal.

**Duration:** 30 minutes

### Step 2.1 — Create Enrollment Token via Portal

1. Open the portal at http://localhost:3000
2. Log in with `admin@training.local` / `TrainingPass123!`
3. Navigate to **Agents → Enrollment**
4. Click **Create Enrollment Token**
5. Fill in:
   - Name: `training-agents`
   - Default labels (JSON): `{"environment": "training", "team": "platform"}`
   - Max uses: `10`
6. Click Create
7. **Copy the token** — it starts with `xse_`

**[Screenshot placeholder: Enrollment token creation form and success dialog showing token value]**

Alternatively, use the API directly:
```bash
# Create enrollment token via API
curl -s -X POST "$PORTAL_BASE/agents/enrollment-tokens" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "training-agents",
    "default_labels": {"environment": "training", "team": "platform"},
    "max_uses": 10
  }' | jq

export ENROLLMENT_TOKEN="xse_..."
```

### Step 2.2 — Seed the Local Dev Agents

The local dev stack includes two pre-built agent containers. Seed them with your organization:

```bash
# First, get your org's internal UUID from Postgres
ORG_UUID=$(docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor -tAc \
  "SELECT id FROM organizations WHERE name='TrainingOrg' LIMIT 1")
echo "Org UUID: $ORG_UUID"

# Seed local agents with this org
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor \
  -v SEED_ORG_ID="$ORG_UUID" \
  -f /tmp/seed-local.sql
# (Copy the seed file into the container first)

# Or use the just command if available:
just agents seed $ORG_UUID
```

### Step 2.3 — Start the Local Agents

```bash
# The local dev docker-compose includes agent-1 and agent-2
# Check their status
docker compose logs agent-1 --tail=20
docker compose logs agent-2 --tail=20

# Look for these log lines indicating successful enrollment:
# "Connected to OpAMP server"
# "Config applied"
# "RemoteConfigStatus: APPLIED"
```

**Validation in Portal:**
1. Navigate to **Agents** in the portal
2. You should see `agent-1` and `agent-2` listed
3. Status should be `online` (green indicator)
4. Labels should show `environment=training`, `team=platform`

**[Screenshot placeholder: Agents list page showing agent-1 and agent-2 with status=online and label badges]**

### Step 2.4 — Validate Agent Details

```bash
# List agents via API
curl -s "$PORTAL_BASE/agents" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.agents[] | {id, hostname, status, labels}'

# Expected:
# {
#   "id": "...",
#   "hostname": "agent-1",
#   "status": "online",
#   "labels": {"environment": "training", "team": "platform", "service.name": "io.opentelemetry.collector"}
# }
```

**Lab 2 Checkpoint:** ✅ Two agents are enrolled and online.

---

## LAB 3: Configuration Management

**Objective:** Create a config template, assign it to agents, and validate delivery.

**Duration:** 30 minutes

### Step 3.1 — Create Config Secrets

First, add secrets that the config template will reference:

1. Navigate to **Agents → Config → Secrets**
2. Click **Add Secret**
3. Create secret: Name=`training_api_key`, Value=your `$API_KEY` value
4. Create secret: Name=`training_tenant_id`, Value=your `$TENANT_ID` value

**[Screenshot placeholder: Secret creation dialog showing Name and Value fields]**

### Step 3.2 — Create Config Template

1. Navigate to **Agents → Config → New Template**
2. Name: `training-metrics-logs`
3. Paste this configuration:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 128
  batch:
    timeout: 5s
    send_batch_size: 512

exporters:
  prometheusremotewrite:
    endpoint: http://envoy:8080/api/v1/push
    headers:
      Authorization: Bearer ${secret:training_api_key}
      X-Scope-OrgID: ${secret:training_tenant_id}
  otlphttp/loki:
    endpoint: http://envoy:8181
    headers:
      Authorization: Bearer ${secret:training_api_key}
      X-Scope-OrgID: ${secret:training_tenant_id}
  debug:
    verbosity: basic

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheusremotewrite, debug]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/loki, debug]
```

4. Click **Save** (creates revision 1)

### Step 3.3 — Assign Template to Agents

1. In the template view, click **Add Assignment**
2. Label selector (JSON): `{}` (empty = matches all agents)
3. Priority: `0`
4. Click Save

**Expected result:** Within 5-10 seconds, the platform pushes the new config to all connected agents.

### Step 3.4 — Validate Config Delivery

```bash
# Check delivery status via API
curl -s "$PORTAL_BASE/agents" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.agents[] | {
    hostname,
    last_config_hash: .last_remote_config_hash,
    status
  }'
```

In the portal:
1. Navigate to **Agents → agent-1**
2. Click **Delivery History**
3. Should show: `status=applied`, `config_hash=<sha256>`

**[Screenshot placeholder: Agent detail page showing delivery history with status=applied and config hash]**

**Check agent logs:**
```bash
docker compose logs agent-1 --tail=30
# Look for: "Config applied", otelcol-contrib startup messages
```

### Step 3.5 — Rollback Test

1. Update the template (change batch timeout from 5s to 10s)
2. Save (creates revision 2)
3. Observe agents update (delivery history shows new hash)
4. Roll back to revision 1: navigate to Revisions → select revision 1 → Assign
5. Observe agents roll back

**Lab 3 Checkpoint:** ✅ Config deployed and rolled back successfully.

---

## LAB 4: Grafana Datasource Configuration

**Objective:** Connect Grafana to xScaler metrics, logs, and traces, and validate data flow.

**Duration:** 30 minutes

### Step 4.1 — Configure Metrics Datasource

1. Open Grafana at http://localhost:3001 (admin/admin)
2. Navigate to **Connections → Datasources → Add new datasource**
3. Search for and select **Prometheus**
4. Configure:
   ```
   Name: xScaler Metrics (Training)
   URL:  http://localhost:8080
   ```
5. Expand **Custom HTTP Headers** and add:
   - Header: `Authorization`, Value: `Bearer <your API key>`
   - Header: `X-Scope-OrgID`, Value: `<your tenant ID>`
6. Click **Save & test**

**Expected:** "Data source connected and labels found."

**[Screenshot placeholder: Prometheus datasource successfully connected with green checkmark]**

If you see an error, check:
```bash
# Verify the API key works
curl -v "$METRICS_EDGE/api/v1/query?query=up" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" 2>&1 | grep "HTTP"
# Should return 200
```

### Step 4.2 — Configure Logs Datasource

1. Add new datasource → **Loki**
2. Configure:
   ```
   Name: xScaler Logs (Training)
   URL:  http://localhost:8181
   ```
3. Custom HTTP Headers:
   - `Authorization` → `Bearer <api key>`
   - `X-Scope-OrgID` → `<tenant ID>`
4. Save & test

**Expected:** "Data source connected and labels found."

### Step 4.3 — Configure Traces Datasource

1. Add new datasource → **Tempo**
2. Configure:
   ```
   Name: xScaler Traces (Training)
   URL:  http://localhost:8282
   ```
3. Custom HTTP Headers:
   - `Authorization` → `Bearer <api key>`
   - `X-Scope-OrgID` → `<tenant ID>`
4. Under **Trace to logs** (optional for correlation):
   - Data source: xScaler Logs (Training)
   - Tags: `trace_id`
5. Save & test

### Step 4.4 — Validate All Three Datasources

```bash
# Generate test metrics (push via Prometheus remote_write)
# The loadgen service is already pushing data. Verify it's in your tenant:

curl -s \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "$METRICS_EDGE/api/v1/query?query=up" | jq '.data.result | length'
# Expected: > 0

# Validate logs
curl -s \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "$LOGS_EDGE/loki/api/v1/labels" | jq '.data'
# Expected: list of label names (may be empty if no logs pushed yet)

# Validate traces
curl -s \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "$TRACES_EDGE/api/search?limit=5" | jq
# Expected: {traces: [...]}
```

**Lab 4 Checkpoint:** ✅ All three datasources configured and validated.

---

## LAB 5: Dashboard and Alert Creation

**Objective:** Build a multi-signal dashboard and create an alert rule.

**Duration:** 45 minutes

### Step 5.1 — Create the Dashboard

1. In Grafana, navigate to **Dashboards → New Dashboard**
2. Click **Add visualisation**

### Step 5.2 — Add Metrics Panel

1. Select the **xScaler Metrics** datasource
2. Enter PromQL query:
   ```promql
   rate(cortex_request_duration_seconds_count{route="/prometheus/api/v1/push"}[5m])
   ```
3. Set title: `Metrics Ingestion Rate (samples/sec)`
4. Visualisation type: **Time series**
5. Apply

Add a second metrics panel:
1. Click **Add → Visualisation**
2. Query:
   ```promql
   cortex_ingester_active_series{user=~".+"}
   ```
3. Title: `Active Series by Tenant`
4. Legend: `{{user}}`

### Step 5.3 — Add Logs Panel

1. Add visualisation
2. Select **xScaler Logs** datasource
3. LogQL query:
   ```logql
   {job=~".+"}
   ```
4. Visualisation: **Logs**
5. Title: `Recent Log Activity`

### Step 5.4 — Add a Stat Panel

1. Add visualisation
2. Select **xScaler Metrics** datasource
3. Query:
   ```promql
   sum(cortex_ingester_active_series)
   ```
4. Visualisation: **Stat**
5. Title: `Total Active Series`
6. Set unit: `short`

**[Screenshot placeholder: Completed dashboard with 4 panels: ingestion rate, active series by tenant, log viewer, total series stat]**

### Step 5.5 — Save Dashboard

1. Click the **Save** button
2. Dashboard title: `xScaler Training — Overview`
3. Folder: `Training`
4. Save

### Step 5.6 — Create an Alert Rule

1. Navigate to **Alerting → Alert Rules → New Alert Rule**
2. Configure:
   - **Rule name:** `Training — High Active Series`
   - **Group:** `Training`
   - **Folder:** `Training`

3. **Data source:** xScaler Metrics

4. **Query A:**
   ```promql
   sum(cortex_ingester_active_series)
   ```

5. **Reduce B:** Last value of A

6. **Threshold C:** Value B `IS ABOVE` `15000`

7. **Evaluation:**
   - Every: `1m`
   - For: `1m`
   - No data: `OK`

8. **Annotations:**
   - Summary: `Active series approaching plan limit`
   - Description: `Total active series: {{ $values.A.Value }}`

9. **Contact point:** Default (Email)

10. Click **Save rule and exit**

**[Screenshot placeholder: Alert rule configuration page with all settings filled in]**

### Step 5.7 — Validate Alert Rule

```bash
# Check alert rule state
# In Grafana: Alerting → Alert Rules
# Your rule should show "Normal" state (series below threshold)

# To test firing (temporarily), change the threshold to 0:
# Edit rule → change IS ABOVE 15000 to IS ABOVE 0
# Wait 2 minutes → alert should fire to "Firing" state
# Change back to 15000
```

**Lab 5 Checkpoint:** ✅ Dashboard created with metrics + logs panels, alert rule configured.

---

## LAB 6: End-to-End Telemetry Validation

**Objective:** Send metrics, logs, and traces to your tenant and verify they appear in Grafana.

**Duration:** 30 minutes

### Step 6.1 — Send Test Metrics

The local loadgen service can be configured to push to your tenant. For a quick test:

```bash
# Push a simple metric using curl + protobuf
# (Use the loadgen as the easiest approach)

# Configure loadgen to use your tenant
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor -c \
  "UPDATE tenants SET environment='loadgen' WHERE id='$TENANT_ID'"

# Start the loadgen profile
docker compose --profile dev-load up -d loadgen

# Watch logs
docker compose logs loadgen --tail=20
```

**Verify in Grafana:**
1. Open your dashboard
2. Active series should increase
3. Log panel should show activity

### Step 6.2 — Send Test Logs via OTel

From an agent container (or your host if collector is running locally):

```bash
# Test log push via curl
curl -s -X POST "$LOGS_EDGE/loki/api/v1/push" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "streams": [{
      "stream": {
        "service": "training-test",
        "level": "info"
      },
      "values": [
        ["'"$(date +%s%N)"'", "{\"message\": \"Hello from training lab!\", \"level\": \"info\"}"]
      ]
    }]
  }'

# Verify in Grafana Explore → Loki
# Query: {service="training-test"}
```

### Step 6.3 — Send Test Traces via OTLP

```bash
# Send a test trace using curl (OTLP HTTP JSON)
curl -s -X POST "$TRACES_EDGE/otlp/v1/traces" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [{
          "key": "service.name",
          "value": {"stringValue": "training-service"}
        }]
      },
      "scopeSpans": [{
        "spans": [{
          "traceId": "aabbccddeeff00112233445566778899",
          "spanId": "aabbccddeeff0011",
          "name": "training-operation",
          "startTimeUnixNano": "'$(date +%s%N)'",
          "endTimeUnixNano": "'$(($(date +%s%N) + 100000000))'",
          "status": {"code": 1}
        }]
      }]
    }]
  }'

# Verify in Grafana Explore → Tempo
# Search for service: training-service
```

### Step 6.4 — Complete Validation

```bash
# Final validation script
echo "=== xScaler Training Lab Validation ==="

echo -n "1. Metrics API (query): "
METRICS_RESULT=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "$METRICS_EDGE/api/v1/query?query=up")
[ "$METRICS_RESULT" = "200" ] && echo "PASS (HTTP $METRICS_RESULT)" || echo "FAIL (HTTP $METRICS_RESULT)"

echo -n "2. Logs API (labels): "
LOGS_RESULT=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "$LOGS_EDGE/loki/api/v1/labels")
[ "$LOGS_RESULT" = "200" ] && echo "PASS (HTTP $LOGS_RESULT)" || echo "FAIL (HTTP $LOGS_RESULT)"

echo -n "3. Traces API (search): "
TRACES_RESULT=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "$TRACES_EDGE/api/search?limit=1")
[ "$TRACES_RESULT" = "200" ] && echo "PASS (HTTP $TRACES_RESULT)" || echo "FAIL (HTTP $TRACES_RESULT)"

echo -n "4. Agent API (health): "
AGENT_RESULT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8082/healthz)
[ "$AGENT_RESULT" = "200" ] && echo "PASS (HTTP $AGENT_RESULT)" || echo "FAIL (HTTP $AGENT_RESULT)"

echo ""
echo "=== Validation Complete ==="
```

**Expected output:**
```
=== xScaler Training Lab Validation ===
1. Metrics API (query): PASS (HTTP 200)
2. Logs API (labels): PASS (HTTP 200)
3. Traces API (search): PASS (HTTP 200)
4. Agent API (health): PASS (HTTP 200)

=== Validation Complete ===
```

**Lab 6 Checkpoint:** ✅ All signals flowing and visible in Grafana.

---

## LAB 7: Advanced — Config Template with Label-Based Routing

**Objective:** Create two different config templates assigned to agents by label.

**Duration:** 30 minutes (bonus lab)

### Scenario

You have two types of agents:
- `agent-1` — tagged `environment=training`
- `agent-2` — tagged `environment=loadgen`

You want `agent-1` to use a verbose debug config, and `agent-2` to use a production config.

### Step 7.1 — Create Debug Template

Template name: `debug-config`
Label selector: `{"matchLabels": {"environment": "training"}}`

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
processors:
  batch:
    timeout: 1s  # Fast batching for dev
exporters:
  debug:
    verbosity: detailed  # Verbose output
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
```

### Step 7.2 — Create Production Template

Template name: `production-config`
Label selector: `{"matchLabels": {"environment": "loadgen"}}`
Priority: `0`

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
processors:
  memory_limiter:
    limit_mib: 256
  batch:
    timeout: 5s
    send_batch_size: 1024
exporters:
  prometheusremotewrite:
    endpoint: http://envoy:8080/api/v1/push
    headers:
      Authorization: Bearer ${secret:training_api_key}
      X-Scope-OrgID: ${secret:training_tenant_id}
service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheusremotewrite]
```

### Step 7.3 — Verify Correct Assignment

After creating both assignments:

```bash
# Check agent-1 effective config (should be debug)
docker compose logs agent-1 --tail=30 | grep -i "verbosity\|debug"
# Expected: config mentions "verbosity: detailed"

# Check agent-2 effective config (should be production)  
docker compose logs agent-2 --tail=30 | grep -i "prometheusremotewrite\|endpoint"
# Expected: config mentions "prometheusremotewrite"
```

In the portal:
1. Navigate to **Agents → agent-1** → view Effective Config
2. Navigate to **Agents → agent-2** → view Effective Config
3. They should show different configurations

**Lab 7 Checkpoint:** ✅ Label-based config routing working correctly.

---

## Lab Completion Checklist

| Lab | Task | Status |
|---|---|---|
| Lab 1 | Created organisation account | ☐ |
| Lab 1 | Created tenant with ID `xs_*` | ☐ |
| Lab 1 | Created API key starting with `xag_` | ☐ |
| Lab 1 | Validated metrics query returns 200 | ☐ |
| Lab 2 | Created enrollment token starting with `xse_` | ☐ |
| Lab 2 | Two agents showing as `online` in portal | ☐ |
| Lab 3 | Config template created with `${secret:*}` references | ☐ |
| Lab 3 | Config delivered (status=applied in delivery history) | ☐ |
| Lab 3 | Successfully rolled back to revision 1 | ☐ |
| Lab 4 | Prometheus datasource configured and tested | ☐ |
| Lab 4 | Loki datasource configured and tested | ☐ |
| Lab 4 | Tempo datasource configured and tested | ☐ |
| Lab 5 | Dashboard with metrics + logs panels created | ☐ |
| Lab 5 | Alert rule created and in Normal state | ☐ |
| Lab 6 | Metrics, logs, traces all showing in Grafana | ☐ |
| Lab 6 | Full validation script passing 4/4 | ☐ |
| Lab 7 (bonus) | Two templates with label selectors working | ☐ |

---

## Common Lab Issues and Solutions

### "401 Unauthorized" when pushing metrics
```bash
# Check token format
echo $API_KEY | grep "^xag_" || echo "Key should start with xag_"

# Check tenant ID format
echo $TENANT_ID | grep "^xs_" || echo "Tenant ID should start with xs_"

# Test directly
curl -v -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "$METRICS_EDGE/api/v1/query?query=up" 2>&1 | grep "< HTTP"
```

### "400 X-Scope-OrgID" error
```bash
# This means you sent comma-separated values or multiple X-Scope-OrgID headers
# The header must be a single value
# WRONG: X-Scope-OrgID: xs_acme_prod,xs_acme_staging
# RIGHT: X-Scope-OrgID: xs_acme_prod
```

### Agent not enrolling
```bash
# Check agent-api is running
docker compose ps agent-api

# Check agent logs
docker compose logs agent-1 --tail=30 | grep -i "error\|failed\|unauthorized"

# Check enrollment token is seeded
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor -c \
  "SELECT id, name, status, use_count FROM agent_enrollment_tokens"
```

### Grafana datasource test fails
```bash
# Confirm Envoy is running
docker compose ps envoy

# Check Envoy health
curl -s http://localhost:8080/__ping
# Expected: "envoy-ok"

# Check proxy-auth is running
docker compose ps proxy-auth

# Test auth separately
curl -v -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  http://localhost:8080/api/v1/query?query=up 2>&1 | head -30
```

### Config not pushing to agents
```bash
# Check agent-api received the NOTIFY
docker compose logs agent-api --tail=20 | grep -i "push\|notify\|config"

# Check Postgres NOTIFY is working
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor -c \
  "NOTIFY agent_config_changed, 'test'"

# Force reconnect by restarting the agent
docker compose restart agent-1
```
