# Lab 04 — Grafana Datasource Configuration

## Objective

Configure and verify all three xScaler datasources in Grafana, including cross-signal correlation.

## Prerequisites

- [ ] Lab 01 completed (`PROD_TENANT` and `PROD_API_KEY` exported)
- [ ] Grafana accessible: `https://<slug>.g.xscalerlabs.com`
- [ ] Training environment running

## Architecture

```mermaid
graph LR
    GR[Grafana :3001]
    DS_M[Datasource: Prometheus / xMetrics]
    DS_L[Datasource: Loki]
    DS_T[Datasource: Tempo]
    MI[xMetrics :9009]
    LO[xLogs :3100]
    TE[xTraces :3200]

    GR --> DS_M --> MI
    GR --> DS_L --> LO
    GR --> DS_T --> TE
```

## Steps

### Step 1 — Verify Pre-Provisioned Datasources

1. Open `https://<slug>.g.xscalerlabs.com` (admin/admin)
2. Navigate to **Connections → Data Sources**
3. Verify four datasources exist: `platform-metrics`, `xMetrics`, `xLogs`, `tempo`
4. Click **Test** on each — all should show green

### Step 2 — Verify Metrics Datasource

```bash
# Direct query to confirm data exists
curl -s "https://<edge>.m.xscalerlabs.com/prometheus/api/v1/query" \
  -H "X-Scope-OrgID: <your-tenant-id>" \
  --data-urlencode 'query=up' | jq '.data.result | length'
# Expected: > 0
```

### Step 3 — Verify Logs Datasource

In Grafana Explore → `xLogs` datasource:
```logql
{service=~".+"}
```
Expected: Log streams from the loadgen service.

### Step 4 — Verify Traces Datasource

In Grafana Explore → `xTraces` datasource → **Search** → Run Query.
Expected: Recent traces from loadgen.

### Step 5 — Test Cross-Signal Correlation

1. In xTraces Explore, click any trace
2. Click **Logs for this span**
3. Verify xLogs log lines appear

<div class="screenshot-placeholder">
[Screenshot: xTraces trace detail with side panel showing correlated xLogs log lines]
</div>

## Validation

- [ ] All four datasources show green status
- [ ] PromQL `up` returns results
- [ ] LogQL `{service=~".+"}` returns log streams
- [ ] xTraces search returns traces
- [ ] Trace-to-logs correlation works

## Troubleshooting

??? failure "xTraces shows 'no traces'"
    ```bash
    docker compose logs loadgen --tail=20
    docker compose ps loadgen
    ```

---

*← Previous: [Lab 03](lab-03-registration.md)*  
*Next: [Lab 05 — Dashboard Creation →](lab-05-dashboard.md)*
