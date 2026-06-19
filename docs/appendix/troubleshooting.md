# Troubleshooting Reference

## Quick Diagnostic Commands

```bash
# portal-api health
curl -s https://portal.xscalerlabs.com/health | jq .

# agent-api health
curl -s https://agents.xscalerlabs.com/health | jq .

# xMetrics health
curl -s https://<edge>.m.xscalerlabs.com/ready

# xLogs health
curl -s https://<edge>.l.xscalerlabs.com/ready

# xTraces health
curl -s https://<edge>.t.xscalerlabs.com/ready

# Envoy admin stats (platform operators only — requires cluster access)
curl -s http://<envoy-admin>/stats | grep "upstream_rq_total"
```

---

## Authentication Issues

??? failure "401 Unauthorized on data plane"
    **Cause:** Invalid or expired API key.
    ```bash
    # Verify key is valid
    curl -v https://<edge>.m.xscalerlabs.com/api/v1/query \
      -H "Authorization: Bearer $API_KEY" \
      --data-urlencode 'query=up' 2>&1 | grep "< HTTP"
    # Expected: HTTP/1.1 200

    # Check proxy-auth logs
    docker compose logs proxy-auth --tail=20
    ```

??? failure "400 Bad Request — X-Scope-OrgID comma rejected"
    **Cause:** Multiple tenant IDs in header (comma-separated).  
    **Fix:** Use exactly one value in `X-Scope-OrgID`. Never comma-separate.

??? failure "JWT expired — 401 on portal-api"
    **Cause:** JWT tokens expire after 30 minutes.
    ```bash
    export JWT_TOKEN=$(curl -s -X POST $PORTAL_BASE/auth/login \
      -H "Content-Type: application/json" \
      -d '{"email":"admin@example.com","password":"Training123!"}' | jq -r '.token')
    ```

---

## Agent Management Issues

??? failure "Agent not appearing in database"
    ```bash
    # Check agent supervisor logs
    docker compose logs agent-1 --tail=30

    # Check agent-api for connection errors
    docker compose logs agent-api --tail=30

    # Verify enrollment token exists
    docker compose exec postgres psql -U xscaler -d xscaler \
      -c "SELECT display_name, use_count FROM agent_enrollment_tokens;"
    ```

??? failure "Config delivery stuck in 'offered'"
    ```bash
    # Check agent-api logs for push errors
    docker compose logs agent-api | grep "error\|Error" | tail -20

    # Check agent supervisor received the config
    docker compose logs agent-1 | grep "config" | tail -10

    # Manually check delivery status
    docker compose exec postgres psql -U xscaler -d xscaler \
      -c "SELECT status, error FROM agent_config_deliveries ORDER BY offered_at DESC LIMIT 5;"
    ```

??? failure "Config delivery shows 'failed'"
    Check the `error` column for the failure reason:
    ```bash
    docker compose exec postgres psql -U xscaler -d xscaler \
      -c "SELECT error FROM agent_config_deliveries WHERE status='failed' LIMIT 5;" -t -A
    ```
    Common causes: Invalid YAML in template, secret reference `${secret:NAME}` with no matching secret.

---

## Metrics Pipeline Issues

??? failure "Metrics not appearing in Grafana"
    ```bash
    # 1. Check xMetrics has received data
    curl -s "https://<edge>.m.xscalerlabs.com/prometheus/api/v1/query" \
      -H "X-Scope-OrgID: $TENANT_ID" \
      --data-urlencode 'query=count({__name__=~".+"})' | jq '.data.result'

    # 2. Check OTel collector exporter
    docker compose logs otel-collector | grep "prometheusremotewrite" | tail -10

    # 3. Check xMetrics ingestion errors
    docker compose logs client-mimir | grep "error\|Error" | tail -20
    ```

??? failure "xMetrics returns 400 snappy decoding error"
    The remote_write request must be snappy-encoded. Use the OTel Collector `prometheusremotewrite` exporter — it handles encoding automatically.

??? failure "429 Too Many Requests"
    Rate limit exceeded. Check usage and consider upgrading plan:
    ```bash
    curl -s $PORTAL_BASE/dashboard/org/summary \
      -H "Authorization: Bearer $JWT_TOKEN" | jq '.org_active_series, .plan_max_active_series'
    ```

---

## Logs Pipeline Issues

??? failure "xLogs push returns 400"
    Check the timestamp format — must be nanoseconds (19 digits):
    ```bash
    # macOS: brew install coreutils then use gdate
    date +%s%N       # Should return 19-digit number
    ```

??? failure "xLogs streams not found in Grafana"
    ```bash
    # Check xLogs labels exist
    curl -s "https://<edge>.l.xscalerlabs.com/loki/api/v1/labels" \
      -H "X-Scope-OrgID: $TENANT_ID" | jq .
    ```

---

## Traces Pipeline Issues

??? failure "xTraces push returns 403"
    Verify API key has access to traces:
    ```bash
    curl -v https://<edge>.t.xscalerlabs.com/v1/traces \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"resourceSpans":[]}' 2>&1 | grep "< HTTP"
    ```

??? failure "Trace not found by ID"
    Trace ID must be exactly 32 hex chars (16 bytes):
    ```bash
    echo -n "$TRACE_ID" | wc -c   # Must output 32
    ```

---

## PostgreSQL Issues

```bash
# Connect to PostgreSQL
docker compose exec postgres psql -U xscaler -d xscaler

# Check all table row counts
\dt
SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;

# Check active connections
SELECT count(*) FROM pg_stat_activity;

# Check LISTEN/NOTIFY
SELECT pid, query, state FROM pg_stat_activity WHERE query LIKE '%LISTEN%';
```

---

## Escalation Path

| Level | Contact | Scope |
|---|---|---|
| L1 | Team internal | Config errors, data not appearing, basic auth issues |
| L2 | xScaler Support (portal → Support) | Platform bugs, performance issues, billing questions |
| L3 | xScaler Engineering | Outages, data loss incidents, security concerns |

---

*← Previous: [API Examples](api-examples.md)*  
*Next: [Home →](../index.md)*
