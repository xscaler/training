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

<details>
<summary><strong>401 Unauthorized on data plane</strong></summary>

**Cause:** Invalid or expired API key.
```bash
# Verify key is valid
curl -v https://<edge>.m.xscalerlabs.com/api/v1/query \
  -H "Authorization: Bearer $API_KEY" \
  --data-urlencode 'query=up' 2>&1 | grep "< HTTP"
# Expected: HTTP/1.1 200
```
If still 401, rotate the API key in the portal under **Tenants → [tenant] → API Keys → Rotate**.

</details>

<details>
<summary><strong>400 Bad Request — X-Scope-OrgID comma rejected</strong></summary>

**Cause:** Multiple tenant IDs in header (comma-separated).  
**Fix:** Use exactly one value in `X-Scope-OrgID`. Never comma-separate.

</details>

<details>
<summary><strong>JWT expired — 401 on portal-api</strong></summary>

**Cause:** JWT tokens expire after 30 minutes.
```bash
export JWT_TOKEN=$(curl -s -X POST $PORTAL_BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Training123!"}' | jq -r '.token')
```

</details>

---

## Agent Management Issues

<details>
<summary><strong>Agent not appearing in portal fleet</strong></summary>

1. Verify the OTel Supervisor started with no errors — check its stdout for `Connected to OpAMP server`.
2. Confirm the enrollment token is valid: in the portal go to **Agents → Enrollment Tokens** and check it is not expired or revoked.
3. Verify network access: `curl -v wss://agents.xscalerlabs.com/health` should return HTTP 200 before the WebSocket upgrade.
4. If the token was single-use, it may have been consumed by an earlier attempt — create a new token.

</details>

<details>
<summary><strong>Config delivery stuck in 'offered'</strong></summary>

1. In the portal, open **Agents → Fleet → [agent] → Config History**. Check the status column for any error message.
2. Verify the config template YAML is valid — paste it into the portal template editor; it validates on save.
3. Check that any `${secret:NAME}` references in the template have a matching secret configured in **Config → Secrets**.
4. If the agent is offline, config delivery resumes automatically when it reconnects.

</details>

<details>
<summary><strong>Config delivery shows 'failed'</strong></summary>

Open the portal **Agents → Fleet → [agent] → Config History** and click the failed delivery row to see the error detail.

Common causes:
- Invalid YAML in the template (syntax error)
- A `${secret:NAME}` placeholder with no matching secret in **Config → Secrets**
- Agent reported an error applying the config (check agent supervisor logs)

</details>

---

## Metrics Pipeline Issues

<details>
<summary><strong>Metrics not appearing in Grafana</strong></summary>

```bash
# Check xMetrics has received data for your tenant
curl -s "https://<edge>.m.xscalerlabs.com/prometheus/api/v1/query" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  -H "Authorization: Bearer $API_KEY" \
  --data-urlencode 'query=count({__name__=~".+"})' | jq '.data.result'
```
If this returns empty, the collector is not reaching the metrics endpoint. Check:

1. Collector exporter endpoint matches `https://<edge>.m.xscalerlabs.com/otlp` (or the remote_write URL)
2. API key has not expired — rotate in the portal if needed
3. The `X-Scope-OrgID` / tenant ID in the collector config matches an active tenant

</details>

<details>
<summary><strong>xMetrics returns 400 snappy decoding error</strong></summary>

The remote_write request must be snappy-encoded. Use the OTel Collector `prometheusremotewrite` exporter — it handles encoding automatically.

</details>

<details>
<summary><strong>429 Too Many Requests</strong></summary>

Rate limit exceeded. Check usage and consider upgrading plan:
```bash
curl -s $PORTAL_BASE/dashboard/org/summary \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.org_active_series, .plan_max_active_series'
```

</details>

---

## Logs Pipeline Issues

<details>
<summary><strong>xLogs push returns 400</strong></summary>

Check the timestamp format — must be nanoseconds (19 digits):
```bash
# macOS: brew install coreutils then use gdate
date +%s%N       # Should return 19-digit number
```

</details>

<details>
<summary><strong>xLogs streams not found in Grafana</strong></summary>

```bash
# Check xLogs labels exist
curl -s "https://<edge>.l.xscalerlabs.com/loki/api/v1/labels" \
  -H "X-Scope-OrgID: $TENANT_ID" | jq .
```

</details>

---

## Traces Pipeline Issues

<details>
<summary><strong>xTraces push returns 403</strong></summary>

Verify API key has access to traces:
```bash
curl -v https://<edge>.t.xscalerlabs.com/v1/traces \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[]}' 2>&1 | grep "< HTTP"
```

</details>

<details>
<summary><strong>Trace not found by ID</strong></summary>

Trace ID must be exactly 32 hex chars (16 bytes):
```bash
echo -n "$TRACE_ID" | wc -c   # Must output 32
```

</details>

---

## Escalation Path

| Level | Contact | Scope |
|---|---|---|
| L1 | Team internal | Config errors, data not appearing, basic auth issues |
| L2 | xScaler Support (portal → Support) | Platform bugs, performance issues, billing questions |
| L3 | xScaler Engineering | Outages, data loss incidents, security concerns |

---

*← Previous: [API Examples](api-examples.md)*  
*Next: [Home →](../index.mdx)*
