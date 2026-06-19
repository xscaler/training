# API Examples Reference

## Environment Setup

```bash
export PORTAL_BASE="http://localhost:8081"
export METRICS_BASE="http://localhost:8080"
export LOGS_BASE="http://localhost:8181"
export TRACES_BASE="http://localhost:8282"
export GRAFANA_URL="http://localhost:3001"

# Authenticate
export JWT_TOKEN=$(curl -s -X POST $PORTAL_BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Training123!"}' | jq -r '.token')
```

## Portal API — Tenants

```bash
# Create tenant
curl -s -X POST $PORTAL_BASE/tenants \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"display_name": "My Service", "environment": "prod"}' | jq .

# List tenants
curl -s $PORTAL_BASE/tenants -H "Authorization: Bearer $JWT_TOKEN" | jq '.[].id'

# Get tenant
curl -s $PORTAL_BASE/tenants/$TENANT_ID -H "Authorization: Bearer $JWT_TOKEN" | jq .

# Create API key
curl -s -X POST $PORTAL_BASE/tenants/$TENANT_ID/keys \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"display_name": "prod-collector"}' | jq .

# Revoke API key
curl -s -X DELETE $PORTAL_BASE/tenants/$TENANT_ID/keys/$KEY_ID \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## Portal API — Organisation

```bash
# Get org details
curl -s $PORTAL_BASE/org -H "Authorization: Bearer $JWT_TOKEN" | jq .

# Invite member
curl -s -X POST $PORTAL_BASE/org/members/invite \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"colleague@example.com","role":"member"}' | jq .

# Get usage summary
curl -s $PORTAL_BASE/dashboard/org/summary \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .
```

## Data Plane API — Metrics

```bash
# Query (PromQL instant)
curl -s "$METRICS_BASE/prometheus/api/v1/query" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  --data-urlencode 'query=up' | jq '.data.result'

# Query range
curl -s "$METRICS_BASE/prometheus/api/v1/query_range" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  --data-urlencode 'query=rate(http_requests_total[5m])' \
  --data-urlencode "start=$(date -v-1H +%s)" \
  --data-urlencode "end=$(date +%s)" \
  --data-urlencode 'step=60' | jq '.data.result | length'

# List label names
curl -s "$METRICS_BASE/prometheus/api/v1/labels" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" | jq '.data[:10]'
```

## Data Plane API — Logs

```bash
# Query logs
curl -s "$LOGS_BASE/loki/api/v1/query" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  --data-urlencode 'query={service="my-service"}' \
  --data-urlencode 'limit=10' | jq '.data.result[0].values[:3]'

# Push logs (xLogs format)
curl -s -X POST "$LOGS_BASE/loki/api/v1/push" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "streams": [{
      "stream": {"service": "my-service", "level": "info"},
      "values": [["'"$(date +%s%N)"'", "Hello from training"]]
    }]
  }'
```

## Data Plane API — Traces

```bash
# Push trace (OTLP HTTP)
TRACE_ID=$(openssl rand -hex 16)
SPAN_ID=$(openssl rand -hex 8)

curl -s -X POST "$TRACES_BASE/v1/traces" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [{"key": "service.name", "value": {"stringValue": "my-service"}}]
      },
      "scopeSpans": [{
        "spans": [{
          "traceId": "'"$TRACE_ID"'",
          "spanId": "'"$SPAN_ID"'",
          "name": "Test Span",
          "kind": 2,
          "startTimeUnixNano": "'"$(date +%s%N)"'",
          "endTimeUnixNano": "'"$(($(date +%s) + 1))$(date +%N | cut -c1-9)"'",
          "status": {"code": 1}
        }]
      }]
    }]
  }'

# Query trace by ID
curl -s "http://localhost:3200/api/traces/$TRACE_ID" \
  -H "X-Scope-OrgID: $TENANT_ID" | jq '.batches | length'
```

---

*← Previous: [OpAMP Deployment](ansible-playbooks.md)*  
*Next: [Troubleshooting →](troubleshooting.md)*
