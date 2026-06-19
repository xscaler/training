# Session 7 Lab Guide — End-to-End Platform Exercise

## Lab Overview

This lab walks through the complete xScaler platform workflow from a fresh tenant to a working dashboard with alerts. Allow **75 minutes** to complete all steps.

**Estimated time:** 75 minutes  
**Difficulty:** Intermediate

---

## Prerequisites

- [ ] Local dev stack is running: `docker compose ps` shows all services healthy
- [ ] JWT token from signup: `export JWT_TOKEN=...`
- [ ] Portal base URL: `export PORTAL_BASE="http://localhost:8081"`

---

## Part 1 — Tenant and API Key Setup (15 minutes)

### Step 1.1 — Create a Tenant

```bash
# Create your personal lab tenant
LAB_TENANT=$(curl -s -X POST $PORTAL_BASE/tenants \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Lab7 Tenant",
    "environment": "dev"
  }')

echo $LAB_TENANT | jq .
export TENANT_ID=$(echo $LAB_TENANT | jq -r '.id')
echo "Tenant ID: $TENANT_ID"
```

**Expected output:**
```json
{
  "id": "xs_lab7_ab3cd4ef",
  "display_name": "Lab7 Tenant",
  "environment": "dev",
  "metrics_host": "euw1-01.m.xscalerlabs.com"
}
```

### Step 1.2 — Create API Keys

```bash
# Create primary key
PRIMARY=$(curl -s -X POST $PORTAL_BASE/tenants/$TENANT_ID/keys \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"display_name": "lab7-primary"}')

export API_KEY=$(echo $PRIMARY | jq -r '.key')
echo "Primary API Key: $API_KEY"
echo "⚠️  Save this key — it will not be shown again!"

# Create backup key
BACKUP=$(curl -s -X POST $PORTAL_BASE/tenants/$TENANT_ID/keys \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"display_name": "lab7-backup"}')

export BACKUP_KEY=$(echo $BACKUP | jq -r '.key')
echo "Backup API Key: $BACKUP_KEY"
```

### Checkpoint 1

```bash
# Verify tenant and keys exist
echo "=== Tenant ==="
curl -s $PORTAL_BASE/tenants/$TENANT_ID \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.id, .display_name'

echo "=== API Keys ==="
curl -s $PORTAL_BASE/tenants/$TENANT_ID/keys \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.[].display_name'
```

✅ Expected: Tenant ID printed, two API key names shown

---

## Part 2 — Push Test Telemetry (15 minutes)

### Step 2.1 — Push Test Metrics

```bash
# Send metrics via OTLP JSON format
curl -s -X POST "http://localhost:8080/otlp/v1/metrics" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceMetrics": [{
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "lab7-service"}},
          {"key": "deployment.environment", "value": {"stringValue": "dev"}}
        ]
      },
      "scopeMetrics": [{
        "metrics": [{
          "name": "lab7_requests_total",
          "description": "Lab 7 test counter",
          "sum": {
            "dataPoints": [{
              "asDouble": 42,
              "timeUnixNano": "'"$(date +%s%N)"'"
            }],
            "isMonotonic": true,
            "aggregationTemporality": 2
          }
        }]
      }]
    }]
  }'
```

**Expected:** HTTP 200 OK (or 204 No Content)

### Step 2.2 — Push Test Logs

```bash
# Send logs via xLogs push API
curl -s -X POST "http://localhost:8181/loki/api/v1/push" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "streams": [{
      "stream": {
        "service": "lab7-service",
        "environment": "dev",
        "level": "info"
      },
      "values": [
        ["'"$(date +%s%N)"'", "Lab7 test log: service started successfully"],
        ["'"$(($(date +%s) + 1))$(date +%N | cut -c1-6)000"'", "Lab7 test log: handling request route=/api/health"]
      ]
    }]
  }'
```

### Step 2.3 — Push Test Traces

```bash
# Generate random trace and span IDs
TRACE_ID=$(openssl rand -hex 16)
SPAN_ID=$(openssl rand -hex 8)
NOW_NS=$(date +%s%N)
END_NS=$((NOW_NS + 150000000))  # +150ms

curl -s -X POST "http://localhost:8282/v1/traces" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "lab7-service"}},
          {"key": "deployment.environment", "value": {"stringValue": "dev"}}
        ]
      },
      "scopeSpans": [{
        "spans": [{
          "traceId": "'"$TRACE_ID"'",
          "spanId": "'"$SPAN_ID"'",
          "name": "Lab7 Test Span",
          "kind": 2,
          "startTimeUnixNano": "'"$NOW_NS"'",
          "endTimeUnixNano": "'"$END_NS"'",
          "attributes": [
            {"key": "http.method", "value": {"stringValue": "POST"}},
            {"key": "http.target", "value": {"stringValue": "/api/test"}},
            {"key": "http.status_code", "value": {"intValue": 200}}
          ],
          "status": {"code": 1}
        }]
      }]
    }]
  }'

echo "Trace ID: $TRACE_ID"
```

### Checkpoint 2

```bash
# Verify metrics
echo "=== Metrics ==="
curl -s "http://localhost:9009/prometheus/api/v1/query" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  --data-urlencode 'query=lab7_requests_total' | jq '.data.result | length'
# Expected: 1 (series found)

# Verify logs
echo "=== Logs ==="
curl -s "http://localhost:3100/loki/api/v1/query" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  --data-urlencode 'query={service="lab7-service"}' \
  --data-urlencode 'limit=5' | jq '.data.result | length'
# Expected: 1 (stream found)

# Verify traces (check xTraces)
echo "=== Traces ==="
curl -s "http://localhost:3200/api/traces/$TRACE_ID" \
  -H "X-Scope-OrgID: $TENANT_ID" | jq '.batches | length'
# Expected: 1
```

✅ Expected: Each check returns `1`

---

## Part 3 — Grafana Dashboard (25 minutes)

### Step 3.1 — Verify Grafana Access

Open `http://localhost:3001` — login: `admin` / `admin`

### Step 3.2 — Create a Dashboard via API

```bash
# Create the Lab7 dashboard via Grafana API
curl -s -X POST "http://localhost:3001/api/dashboards/db" \
  -u "admin:admin" \
  -H "Content-Type: application/json" \
  -d '{
    "dashboard": {
      "title": "Lab7: Service Dashboard",
      "panels": [
        {
          "type": "timeseries",
          "title": "Lab7 Request Counter",
          "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0},
          "targets": [{
            "datasource": {"type": "prometheus", "uid": ""},
            "expr": "lab7_requests_total",
            "legendFormat": "requests"
          }]
        },
        {
          "type": "logs",
          "title": "Lab7 Logs",
          "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0},
          "targets": [{
            "datasource": {"type": "loki", "uid": ""},
            "expr": "{service=\"lab7-service\"}",
            "legendFormat": ""
          }]
        }
      ]
    },
    "overwrite": true,
    "folderId": 0
  }' | jq '.url'
```

<div class="screenshot-placeholder">
[Screenshot: Lab7 Service Dashboard in Grafana showing the request counter time series panel and logs panel side by side]
</div>

### Step 3.3 — Find Your Trace in xTraces

1. Open Grafana → **Explore** → Select `tempo` datasource
2. Enter your trace ID:
```
$TRACE_ID
```
3. Verify the span appears with the correct attributes

<div class="screenshot-placeholder">
[Screenshot: xTraces showing the Lab7 Test Span with 150ms duration and POST /api/test attributes]
</div>

---

## Part 4 — Create an Alert (15 minutes)

### Step 4.1 — Create Alert Rule via API

```bash
# Create a simple alert that will fire (always-true condition for testing)
curl -s -X POST "http://localhost:3001/api/v1/provisioning/alert-rules" \
  -u "admin:admin" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Lab7: Test Alert",
    "ruleGroup": "lab7",
    "folderUID": "general",
    "for": "30s",
    "orgID": 1,
    "condition": "B",
    "data": [
      {
        "refId": "A",
        "datasourceUid": "__expr__",
        "model": {
          "expression": "1",
          "type": "math",
          "refId": "A"
        }
      },
      {
        "refId": "B",
        "datasourceUid": "__expr__",
        "model": {
          "conditions": [{
            "evaluator": {"params": [0], "type": "gt"},
            "operator": {"type": "and"},
            "query": {"params": ["A"]},
            "reducer": {"type": "last"},
            "type": "query"
          }],
          "type": "classic_conditions",
          "refId": "B"
        }
      }
    ],
    "labels": {"severity": "info", "lab": "lab7"},
    "annotations": {"summary": "Lab7 test alert - always fires"}
  }' | jq '.uid'
```

### Step 4.2 — Verify Alert Firing

1. Navigate to **Alerting → Alert rules** in Grafana
2. Find `Lab7: Test Alert`
3. Watch it transition: **Normal → Pending (30s) → Firing**

<div class="screenshot-placeholder">
[Screenshot: Grafana alert rules page showing Lab7 Test Alert in Firing state with red badge]
</div>

---

## Part 5 — Validation and Cleanup (5 minutes)

### Complete Validation Checklist

```bash
echo "=== Lab 7 Validation ==="

echo "1. Tenant exists:"
curl -s $PORTAL_BASE/tenants/$TENANT_ID \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.id // "FAIL"'

echo "2. API Keys created:"
curl -s $PORTAL_BASE/tenants/$TENANT_ID/keys \
  -H "Authorization: Bearer $JWT_TOKEN" | jq 'length // 0'

echo "3. Metrics ingested:"
curl -s "http://localhost:9009/prometheus/api/v1/query" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  --data-urlencode 'query=lab7_requests_total' | jq '.data.result | length // 0'

echo "4. Logs ingested:"
curl -s "http://localhost:3100/loki/api/v1/query" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  --data-urlencode 'query={service="lab7-service"}' \
  --data-urlencode 'limit=1' | jq '.data.result | length // 0'

echo "5. Traces ingested:"
curl -s "http://localhost:3200/api/traces/$TRACE_ID" \
  -H "X-Scope-OrgID: $TENANT_ID" | jq '.batches | length // 0'
```

✅ **Expected output:** All values should be `1` or greater

---

## Troubleshooting

??? failure "Metrics push returns 401"
    Re-export the API key:
    ```bash
    # Check if the key is still valid
    curl -v http://localhost:8080/api/v1/query \
      -H "Authorization: Bearer $API_KEY" \
      --data-urlencode 'query=up' 2>&1 | grep "< HTTP"
    ```

??? failure "xLogs push returns 400"
    The timestamp must be in nanoseconds. Check format:
    ```bash
    # Correct: 19-digit nanoseconds
    date +%s%N  # macOS: may need gdate +%s%N
    ```
    On macOS, install GNU date: `brew install coreutils` then use `gdate`.

??? failure "Trace not found in xTraces"
    Trace ID must be exactly 32 hex characters (16 bytes). Verify:
    ```bash
    echo -n "$TRACE_ID" | wc -c  # Should output 32
    ```

??? failure "Dashboard panels show 'No data'"
    Verify the tenant ID is correct in the datasource header. The local dev datasources use `${LOADGEN_GRAFANA_TENANT}` not your lab tenant.
    For local dev, query directly without Envoy routing:
    ```bash
    curl -s "http://localhost:9009/prometheus/api/v1/query" \
      -H "X-Scope-OrgID: $TENANT_ID" \
      --data-urlencode 'query=lab7_requests_total' | jq .
    ```

---

*← Previous: [Session 7 Overview](overview.md)*  
*Next: [Wrap-Up →](wrap-up.md)*
