# xScaler Observability Platform
# Troubleshooting Guide
**For Platform Administrators, DevOps Engineers, and SRE Teams**

---

## Diagnostic Quick Reference

### Health Check Commands (run first)

```bash
# Check all services (Docker Compose local dev)
docker compose ps

# Check Envoy (metrics edge)
curl -s http://localhost:8080/__ping
# Expected: "envoy-ok"

# Check portal-api
curl -s http://localhost:8081/healthz | jq
# Expected: {"status":"ok"}

# Check agent-api
curl -s http://localhost:8082/healthz | jq
# Expected: {"status":"ok"}

# Check Mimir (metrics)
curl -s http://localhost:9009/ready
# Expected: "ready"

# Check Loki (logs)
curl -s http://localhost:3100/ready
# Expected: "ready"

# Check Tempo (traces)
curl -s http://localhost:3200/ready
# Expected: "ready"
```

---

## Section 1: Authentication & Authorization Issues

### 1.1 HTTP 401 Unauthorized

**Symptom:** API requests return `401 Unauthorized`

**Cause investigation:**
```bash
# Test 1: Verify API key format
echo $API_KEY | head -c 4
# Expected: "xag_"

# Test 2: Verify the key exists in DB
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor -c \
  "SELECT name, status, last_used_at FROM api_keys WHERE name='your-key-name'"
# Expected: row with status='active'

# Test 3: Check proxy-auth is running and reachable
docker compose logs proxy-auth --tail=20 | grep -E "error|failed"

# Test 4: Verbose auth check
curl -v -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  http://localhost:8080/api/v1/query?query=up 2>&1 | grep -E "< HTTP|Authorization|Unauthorized"
```

**Solutions:**
- Verify the key starts with `xag_` (agent keys) not `xse_` (enrollment tokens)
- Check key status in portal — it may have been revoked
- Create a new key if the original was lost
- Ensure `Authorization: Bearer <key>` format (not `Token`, not just the key value)

### 1.2 HTTP 403 Forbidden

**Symptom:** Request authenticated but returns `403 Forbidden`

**Cause investigation:**
```bash
# Check proxy-auth logs for the specific reason
docker compose logs proxy-auth --tail=50 | grep -i "forbidden\|denied\|path"

# Common causes:
# 1. Path not allowed for backend kind
# 2. Billing soft-lock (plan expired/over limit)
# 3. Rate limit exceeded
```

**Path validation for each backend kind:**
```bash
# Metrics paths (proxy-auth with AUTH_BACKEND_KIND=metrics)
# Allowed: /api/v1/push, /api/v1/query*, /api/v1/labels*, /api/v1/series, /api/v1/metadata, /api/v1/status/*
# NOT allowed: /loki/api/v1/*, /otlp/v1/logs

# Test: try the correct path
curl -H "Authorization: Bearer $API_KEY" -H "X-Scope-OrgID: $TENANT_ID" \
  http://localhost:8080/api/v1/query?query=up
# vs wrong path
curl -H "Authorization: Bearer $API_KEY" -H "X-Scope-OrgID: $TENANT_ID" \
  http://localhost:8080/loki/api/v1/labels  # This goes to the WRONG listener (metrics edge)
```

**Solutions:**
- Use port `:8080` for metrics, `:8181` for logs, `:8282/:4317` for traces
- Check if billing is soft-locked: navigate to portal → Billing
- Check rate limit status in proxy-auth metrics: `curl http://localhost:9002/metrics | grep ratelimit`

### 1.3 HTTP 400 — X-Scope-OrgID Error

**Symptom:** `400 Bad Request` with message about X-Scope-OrgID

**Exact error message:**
```
Sending multiple X-Scope-OrgID headers is not allowed. Use a single header with | as separator instead.
```

**Cause:** Multiple X-Scope-OrgID headers or comma-separated values sent

**Solution:**
```bash
# WRONG - comma separated
curl -H "X-Scope-OrgID: xs_acme_prod,xs_acme_staging" ...

# WRONG - multiple headers
curl -H "X-Scope-OrgID: xs_acme_prod" -H "X-Scope-OrgID: xs_acme_staging" ...

# CORRECT - pipe separator (Mimir multi-tenant query)
curl -H "X-Scope-OrgID: xs_acme_prod|xs_acme_staging" ...

# CORRECT - single tenant
curl -H "X-Scope-OrgID: xs_acme_prod" ...
```

### 1.4 JWT Token Issues (Portal Login)

**Symptom:** Portal login fails or pages show as unauthenticated

```bash
# Check portal-api auth logs
docker compose logs portal-api --tail=30 | grep -i "auth\|jwt\|token\|login"

# Test login directly
curl -s -X POST http://localhost:8081/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@training.local","password":"TrainingPass123!"}' | jq

# If 401, check user exists in DB
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor -c \
  "SELECT email, auth_provider FROM users WHERE email='admin@training.local'"
```

---

## Section 2: Agent Management Issues

### 2.1 Agent Not Enrolling

**Symptom:** Supervisor starts but agent does not appear in portal

**Diagnostic steps:**
```bash
# Step 1: Check supervisor logs
docker compose logs agent-1 --tail=50 | grep -E "error|failed|unauthorized|401"
# Or for production:
journalctl -u otel-supervisor -n 50

# Step 2: Verify agent-api is reachable
curl -s http://localhost:8082/healthz
# or
curl -s ws://localhost:8082/v1/opamp -H "Connection: Upgrade" -H "Upgrade: websocket" -v 2>&1 | head -10

# Step 3: Verify enrollment token in DB
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor \
  -c "SELECT name, status, use_count, max_uses, expires_at FROM agent_enrollment_tokens"
# Look for: status='active', use_count < max_uses (if max_uses is set), expires_at is NULL or future

# Step 4: Check token hash matches
python3 -c "import hashlib; print(hashlib.sha256(b'xse_your_token_here').hexdigest())"
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor \
  -c "SELECT token_hash FROM agent_enrollment_tokens WHERE name='local-dev'"
```

**Solutions:**
- Token expired → create a new enrollment token
- Token max_uses reached → increase max_uses or create new token
- Token revoked → create new token
- Wrong URL in supervisor config → verify `wss://agents.xscalerlabs.com/v1/opamp`

### 2.2 Agent Shows as Offline

**Symptom:** Agent was online, now shows `offline` status

```bash
# Check agent's last_seen_at
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor \
  -c "SELECT instance_uid, status, last_seen_at FROM agents ORDER BY last_seen_at DESC LIMIT 5"

# Check supervisor process
systemctl status otel-supervisor  # or:
docker compose ps agent-1

# Restart supervisor
systemctl restart otel-supervisor  # or:
docker compose restart agent-1

# Watch for reconnection
docker compose logs agent-1 -f --tail=10
# Expected: "Connected to server at ws://..."
```

**Agent goes offline after 90 seconds (default `AGENT_STALE_AFTER`)** — this is normal if the supervisor crashed or lost network. It will come back online when it reconnects.

### 2.3 Config Not Applying to Agent

**Symptom:** Config updated in portal but agent still runs old config

**Diagnostic:**
```bash
# Check delivery history in portal
# Navigate to: Agents → [agent name] → Delivery History

# Check agent-api received the Postgres NOTIFY
docker compose logs agent-api --tail=20 | grep -i "push\|notify\|config\|org"

# Check the current config hash on the agent vs what's expected
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor \
  -c "SELECT a.hostname, a.last_remote_config_hash, d.status, d.error_message
      FROM agents a
      LEFT JOIN agent_config_deliveries d ON d.agent_id = a.id
      ORDER BY d.offered_at DESC LIMIT 10"
```

**Common causes:**
1. **Secret unavailable:** Check `agent_config_deliveries.error_message = 'agent config secret unavailable'`
   - Go to Agents → Config → Secrets and verify the secret exists and is correct

2. **YAML syntax error in template:** Agent reports `failed` with a YAML parse error
   - Validate your YAML with `yamllint` before saving

3. **agent-api not receiving NOTIFY:** PostgreSQL connection issue
   - Restart agent-api: `docker compose restart agent-api`

4. **Agent not connected:** Agent shows `offline`
   - Restart supervisor (see 2.2)

### 2.4 Agent Config Delivery Failures

**Check delivery status:**
```sql
-- Connect to Postgres
SELECT 
  a.hostname,
  d.config_hash,
  d.status,
  d.error_message,
  d.offered_at,
  d.applied_at
FROM agent_config_deliveries d
JOIN agents a ON a.id = d.agent_id
ORDER BY d.offered_at DESC
LIMIT 20;
```

**Status meanings:**
- `offered` — config sent, waiting for agent acknowledgment
- `applying` — agent received, restarting collector
- `applied` — collector started successfully with new config
- `failed` — collector failed to start with new config (YAML error, missing binary, etc.)

---

## Section 3: Metrics Pipeline Issues

### 3.1 Metrics Not Appearing in Grafana

**Diagnostic flow:**

```bash
# Step 1: Is data reaching Mimir?
curl -s \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "http://localhost:8080/api/v1/query?query=up" | jq '.data.result | length'
# If 0: no metrics in Mimir for this tenant

# Step 2: Is Envoy routing correctly?
curl -v \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "http://localhost:8080/api/v1/status/buildinfo" 2>&1 | grep "< HTTP\|mimir"

# Step 3: Check OTel collector is running
docker compose ps otel-collector
docker compose logs otel-collector --tail=30 | grep -E "error|failed|refused"

# Step 4: Check Mimir is healthy
curl -s http://localhost:9009/ready
docker compose logs client-mimir --tail=20

# Step 5: Verify the tenant ID exists
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor \
  -c "SELECT id, status FROM tenants WHERE id='$TENANT_ID'"
```

### 3.2 Prometheus Remote_Write Configuration

**Standard remote_write config:**
```yaml
remote_write:
  - url: http://localhost:8080/api/v1/push
    authorization:
      type: Bearer
      credentials: ${API_KEY}
    headers:
      X-Scope-OrgID: ${TENANT_ID}
    remote_timeout: 30s
    queue_config:
      capacity: 10000
      max_shards: 5
      min_shards: 1
      max_samples_per_send: 2000
```

**Test remote_write:**
```bash
# Use the built-in loadgen to test
docker compose logs loadgen --tail=20

# Or manual test with snappy encoding
python3 -c "
import requests, snappy, struct
# Build minimal write request protobuf...
print('Use the loadgen for testing — manual protobuf encoding is complex')
"
```

### 3.3 Active Series Over Plan Limit

**Symptom:** HTTP 429 when pushing metrics (Free plan)

```bash
# Check current series count
curl -s \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "http://localhost:8080/api/v1/query?query=count(count by(__name__)({__name__!=\"\"}))" | jq '.data.result[0].value[1]'
# Returns: number of active series

# Check tenant plan limit
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor \
  -c "SELECT t.id, p.name as plan, p.max_active_series, tu.active_series
      FROM tenants t
      JOIN organizations o ON o.id = t.organization_id
      JOIN plans p ON p.id = o.plan_id
      LEFT JOIN tenant_usage tu ON tu.tenant_id = t.id
      WHERE t.id='$TENANT_ID'"
```

**Solutions:**
- Reduce cardinality: remove high-cardinality labels (user_id, request_id) from metrics
- Move per-request data to logs or traces
- Upgrade to Scale plan for unlimited series (metered)

---

## Section 4: Logs Pipeline Issues

### 4.1 Logs Not Appearing in Grafana

```bash
# Step 1: Push a test log entry
curl -s -X POST "$LOGS_EDGE/loki/api/v1/push" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{"streams": [{"stream": {"service": "test"}, "values": [["'"$(date +%s%N)"'", "test log line"]]}]}'
# Expected: empty 204 response

# Step 2: Query for the test log
curl -s \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "$LOGS_EDGE/loki/api/v1/query_range?query={service%3D\"test\"}&limit=5" | jq '.data.result'
# Expected: [{stream: {service: "test"}, values: [...]}]

# Step 3: Check Loki is healthy
curl -s http://localhost:3100/ready
docker compose logs client-loki --tail=20

# Step 4: Check logs proxy-auth
docker compose ps proxy-auth-logs
docker compose logs proxy-auth-logs --tail=20 | grep -i error
```

### 4.2 OTel Collector Logs Export

**Loki OTLP exporter config:**
```yaml
exporters:
  otlphttp/loki:
    endpoint: http://localhost:8181
    headers:
      Authorization: Bearer ${env:API_KEY}
      X-Scope-OrgID: ${env:TENANT_ID}
```

**Verify logs are being exported:**
```bash
# Check OTel collector debug output for log export
docker compose logs otel-collector --tail=50 | grep -i "loki\|log\|export"
```

---

## Section 5: Traces Pipeline Issues

### 5.1 Traces Not Appearing in Tempo

```bash
# Step 1: Send a test trace
curl -s -X POST "$TRACES_EDGE/otlp/v1/traces" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": {"attributes": [{"key":"service.name","value":{"stringValue":"test"}}]},
      "scopeSpans": [{"spans": [{
        "traceId": "aabbccddeeff00112233445566778899",
        "spanId": "aabbccddeeff0011",
        "name": "test-span",
        "startTimeUnixNano": "'$(date +%s%N)'",
        "endTimeUnixNano": "'$(($(date +%s%N) + 1000000000))'",
        "status": {"code": 1}
      }]}]
    }]
  }'
# Expected: 200 OK

# Step 2: Search for the test trace
sleep 5  # Wait for Tempo to index
curl -s \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "$TRACES_EDGE/api/search?tags=service.name%3Dtest&limit=5" | jq '.traces'

# Step 3: Check Tempo health
curl -s http://localhost:3200/ready
docker compose logs tempo --tail=20 | grep -E "error|failed"

# Step 4: Check traces proxy-auth
docker compose ps proxy-auth-traces
```

### 5.2 gRPC Traces (Port 4317) Issues

```bash
# Test gRPC connectivity with grpcurl (if available)
grpcurl -plaintext \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  localhost:4317 \
  opentelemetry.proto.collector.trace.v1.TraceService/Export

# Or use otelcol-contrib with a debug exporter to verify the push
cat > /tmp/test-otelcol.yaml << 'EOF'
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:14317
exporters:
  debug:
    verbosity: detailed
  otlp:
    endpoint: localhost:4317
    headers:
      Authorization: Bearer ${env:API_KEY}
      X-Scope-OrgID: ${env:TENANT_ID}
    tls:
      insecure: true
service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [debug, otlp]
EOF
otelcol-contrib --config /tmp/test-otelcol.yaml
```

---

## Section 6: Grafana Issues

### 6.1 Datasource Connection Failed

```bash
# For each datasource, test the endpoint independently
# Metrics (Prometheus/Mimir)
curl -v -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "http://localhost:8080/api/v1/query?query=up" 2>&1 | grep "HTTP"

# Logs (Loki)
curl -v -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "http://localhost:8181/loki/api/v1/labels" 2>&1 | grep "HTTP"

# Traces (Tempo)
curl -v -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "http://localhost:8282/api/search?limit=1" 2>&1 | grep "HTTP"
```

**Common Grafana configuration mistakes:**

| Mistake | Correct |
|---|---|
| URL includes `/api/v1` suffix | URL should be just the host (e.g., `http://localhost:8080`) |
| Using Loki port for metrics | Metrics: `:8080`, Logs: `:8181` |
| Missing `Bearer` prefix in auth header | Value must be `Bearer xag_...` not just `xag_...` |
| X-Scope-OrgID not set | Must include tenant ID header |
| Using Prometheus datasource for logs | Use Loki datasource type for logs |

### 6.2 Dashboard Shows "No Data"

```bash
# Verify the time range covers when data was pushed
# Grafana default is "Last 6 hours" — check if data was pushed recently

# Check series cardinality
curl -s -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "http://localhost:8080/api/v1/query?query=count(count by(__name__)({__name__!=\"\"}))" | jq

# Check the specific metric exists
curl -s -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  "http://localhost:8080/api/v1/metadata" | jq 'keys[0:10]'
```

---

## Section 7: Database and PostgreSQL Issues

### 7.1 Portal-api Migration Failures

```bash
# Check migration logs
docker compose logs portal-api --tail=50 | grep -i "migration\|migrate\|goose\|error"

# Manual migration check
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor \
  -c "SELECT id, version_id, is_applied FROM goose_db_version ORDER BY id DESC LIMIT 10"

# For agent-api migrations
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor \
  -c "SELECT id, version_id, is_applied FROM goose_db_version_agent ORDER BY id DESC LIMIT 10"
```

### 7.2 Postgres Connection Issues

```bash
# Check Postgres is healthy
docker compose ps postgres
curl -s postgres://xscalor:password@localhost:5432/xscalor  # will fail but checks connectivity

# Check from portal-api
docker exec $(docker ps -qf "name=portal-api") \
  wget -q -O - http://localhost:8081/readyz | jq
# Expected: {"status":"ready"}

# Check active connections
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor \
  -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state"
```

---

## Section 8: Production Operational Scenarios

### 8.1 Edge Cluster Failover

```bash
# If an edge cluster becomes unavailable:
# 1. Check cluster status
kubectl get pods -n mimir-euw1-01
kubectl get pods -n loki-euw1-01

# 2. Check Envoy connectivity
curl -s http://euw1-01.m.xscalerlabs.com/__ping

# 3. Create tenants on alternate cluster
# portal-api auto-assigns to next available cluster
# No manual action needed for new tenants
# Existing tenants: traffic fails until cluster recovers
# Logs show: proxy-auth upstream connection errors

# 4. Scale Mimir for high load
kubectl scale deployment mimir-euw1-01-mimir-distributor \
  --replicas=3 -n mimir-euw1-01
```

### 8.2 Rate Limit Investigation

```bash
# Check proxy-auth rate limit metrics
curl -s http://localhost:9002/metrics | grep -E "ratelimit|throttl|rejected"

# Check which tenants are throttled
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor \
  -c "SELECT t.id, tu.active_series, p.max_active_series, 
      ROUND(100.0 * tu.active_series / NULLIF(p.max_active_series, 0)) as pct_used
      FROM tenant_usage tu
      JOIN tenants t ON t.id = tu.tenant_id
      JOIN organizations o ON o.id = t.organization_id
      JOIN plans p ON p.id = o.plan_id
      ORDER BY pct_used DESC NULLS LAST LIMIT 10"
```

### 8.3 Usage Reporting Debug

```bash
# Check mimir-sync status
docker compose logs mimir-sync --tail=30

# Check tenant_usage table
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor \
  -c "SELECT tenant_id, active_series, logs_bytes_per_sec, updated_at 
      FROM tenant_usage ORDER BY updated_at DESC LIMIT 10"

# Check dashboard rollup is populated
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor \
  -c "SELECT tenant_id, timestamp, dpm_avg 
      FROM dashboard_tenant_hourly 
      ORDER BY timestamp DESC LIMIT 5"

# Manually trigger mimir-sync (local dev)
docker compose restart mimir-sync
```

### 8.4 Emergency Tenant Key Revocation

```bash
# Revoke all keys for a tenant immediately
curl -s -X DELETE \
  "$PORTAL_BASE/tenants/$TENANT_ID/keys/$KEY_ID" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Or directly in DB (emergency only)
docker exec $(docker ps -qf "name=postgres") \
  psql -U xscalor -d xscalor \
  -c "UPDATE api_keys SET status='revoked' WHERE tenant_id='$TENANT_ID'"

# proxy-auth caches for 10s — wait 10-15 seconds for full effect
# The negative_cache_ttl then blocks the revoked token for 2s
```

---

## Section 9: Log Analysis Reference

### Key Log Patterns to Look For

**portal-api:**
```bash
# JWT validation errors
docker compose logs portal-api | grep "jwt\|unauthorized\|invalid token"

# Database errors
docker compose logs portal-api | grep "ERROR.*postgres\|connection refused\|timeout"

# Tenant creation
docker compose logs portal-api | grep "tenant created\|tenant.*id"
```

**proxy-auth:**
```bash
# Auth denials
docker compose logs proxy-auth | grep "unauthorized\|denied\|rejected"

# Rate limit hits
docker compose logs proxy-auth | grep "rate_limit\|throttled\|exceeded"

# Cache behavior
docker compose logs proxy-auth | grep "cache hit\|cache miss\|snapshot"
```

**agent-api:**
```bash
# Enrollment events
docker compose logs agent-api | grep "enroll\|agent upsert\|mint agent key"

# Config push events
docker compose logs agent-api | grep "push\|remote config\|config changed"

# Agent status changes
docker compose logs agent-api | grep "offline\|online\|disconnect"
```

**OTel Collector:**
```bash
# Export failures
docker compose logs otel-collector | grep "error\|failed\|refused\|timeout"

# Drop events (data loss indicator)
docker compose logs otel-collector | grep "drop\|queue full\|refused"

# Batch behavior
docker compose logs otel-collector | grep "batch\|flush\|send"
```

---

## Escalation Path

1. **Level 1 — Self-service:** Check portal → Settings → Support for knowledge base
2. **Level 2 — Platform ticket:** Use Settings → Support → Create Ticket (Zoho Desk integration)
3. **Level 3 — Enterprise SRE:** Direct contact for enterprise customers (dedicated Slack channel)

**Before escalating, collect:**
- Tenant ID (`$TENANT_ID`)
- Time range of the issue (UTC)
- Health check outputs from Section 1
- Relevant log snippets (last 100 lines)
- `docker compose ps` output (or `kubectl get pods`)
- The specific HTTP response code and body if applicable
