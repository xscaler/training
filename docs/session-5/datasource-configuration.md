# Datasource Configuration

## Learning Objectives

- [ ] Configure a Prometheus (xMetrics) datasource with xScaler authentication
- [ ] Configure a xLogs datasource with xScaler authentication
- [ ] Configure a xTraces datasource with xScaler authentication
- [ ] Set up trace-to-logs and trace-to-metrics correlation
- [ ] Use YAML provisioning for GitOps-managed datasource configuration

---

## Prerequisites

Before configuring datasources, you need:
- Grafana instance running (local dev: `http://localhost:3001`)
- xScaler tenant ID (`xs_...`)
- xScaler API key (`xag_...`)
- xScaler endpoint URLs (from tenant details)

---

## Metrics Datasource (Prometheus → xMetrics)

=== "Grafana UI"

    1. Navigate to **Connections → Data Sources → Add data source**
    2. Select **Prometheus**
    3. Configure:

    <div class="screenshot-placeholder">
    [Screenshot: Grafana Prometheus datasource configuration page showing URL and header fields]
    </div>

    | Field | Value |
    |---|---|
    | Name | `xScaler Metrics` |
    | URL | `https://euw1-01.m.xscalerlabs.com/prometheus` |
    | HTTP Method | `POST` |
    | Custom Headers → Header 1 Name | `Authorization` |
    | Custom Headers → Header 1 Value | `Bearer xag_your_api_key` |
    | Custom Headers → Header 2 Name | `X-Scope-OrgID` |
    | Custom Headers → Header 2 Value | `xs_your_tenant_id` |

    4. Click **Save & Test** → expected: `"Data source connected and labels found."`

=== "YAML Provisioning"

    ```yaml
    # grafana/provisioning/datasources/xscaler.yaml
    apiVersion: 1
    datasources:
      - name: xScaler Metrics
        type: prometheus
        access: proxy
        url: https://euw1-01.m.xscalerlabs.com/prometheus
        uid: xscaler-metrics
        isDefault: true
        jsonData:
          httpMethod: POST
          timeInterval: 30s
          manageAlerts: true
          alertmanagerUid: xscaler-alertmanager
          customQueryParameters: ""
        secureJsonData:
          httpHeaderName1: Authorization
          httpHeaderValue1: "Bearer xag_your_api_key"
          httpHeaderName2: X-Scope-OrgID
          httpHeaderValue2: xs_your_tenant_id
    ```

---

## Logs Datasource (xLogs)

=== "Grafana UI"

    1. **Connections → Add data source → xLogs**

    | Field | Value |
    |---|---|
    | Name | `xScaler Logs` |
    | URL | `https://euw1-01.l.xscalerlabs.com` |
    | Custom Headers → Authorization | `Bearer xag_your_api_key` |
    | Custom Headers → X-Scope-OrgID | `xs_your_tenant_id` |

    2. Configure **Derived Fields** for trace correlation:

    <div class="screenshot-placeholder">
    [Screenshot: xLogs datasource with Derived Fields section showing TraceID regex pattern]
    </div>

    | Field | Value |
    |---|---|
    | Name | `TraceID` |
    | Regex | `trace_id=(\w+)` |
    | Query | (link to xTraces datasource) |
    | Internal link | Select `xScaler Traces` datasource |

=== "YAML Provisioning"

    ```yaml
    - name: xScaler Logs
      type: loki
      access: proxy
      url: https://euw1-01.l.xscalerlabs.com
      uid: xscaler-logs
      jsonData:
        derivedFields:
          - datasourceUid: xscaler-traces
            matcherRegex: "trace_id=(\\w+)"
            name: TraceID
            url: "${__value.raw}"
      secureJsonData:
        httpHeaderName1: Authorization
        httpHeaderValue1: "Bearer xag_your_api_key"
        httpHeaderName2: X-Scope-OrgID
        httpHeaderValue2: xs_your_tenant_id
    ```

---

## Traces Datasource (xTraces)

=== "Grafana UI"

    1. **Connections → Add data source → xTraces**

    | Field | Value |
    |---|---|
    | Name | `xScaler Traces` |
    | URL | `https://euw1-01.t.xscalerlabs.com` |
    | Custom Headers → Authorization | `Bearer xag_your_api_key` |
    | Custom Headers → X-Scope-OrgID | `xs_your_tenant_id` |

    2. Configure **Trace to Logs**:
    - Data source: `xScaler Logs`
    - Filter by Trace ID: ✓
    - Tags: `service.name`, `deployment.environment`

    3. Configure **Trace to Metrics**:
    - Data source: `xScaler Metrics`
    - Tags: `service.name → service`

    4. Enable **Service Map**:
    - Data source: `xScaler Metrics`

=== "YAML Provisioning"

    ```yaml
    - name: xScaler Traces
      type: tempo
      access: proxy
      url: https://euw1-01.t.xscalerlabs.com
      uid: xscaler-traces
      jsonData:
        httpMethod: GET
        tracesToLogs:
          datasourceUid: xscaler-logs
          filterByTraceID: true
          filterBySpanID: false
          tags: ["service.name", "deployment.environment"]
        tracesToMetrics:
          datasourceUid: xscaler-metrics
          tags: [{key: "service.name", value: "service"}]
          queries:
            - name: Error rate
              query: "sum(rate(http_errors_total{$__tags}[5m]))"
        serviceMap:
          datasourceUid: xscaler-metrics
        nodeGraph:
          enabled: true
        lokiSearch:
          datasourceUid: xscaler-logs
      secureJsonData:
        httpHeaderName1: Authorization
        httpHeaderValue1: "Bearer xag_your_api_key"
        httpHeaderName2: X-Scope-OrgID
        httpHeaderValue2: xs_your_tenant_id
    ```

---

## Hands-On Exercise

### Exercise 5.3 — Configure All Three Datasources

```bash
# For local dev environment
export GRAFANA_URL="http://localhost:3001"
export GRAFANA_USER="admin"
export GRAFANA_PASS="admin"

# Create Metrics datasource via Grafana API
curl -s -X POST "$GRAFANA_URL/api/datasources" \
  -u "$GRAFANA_USER:$GRAFANA_PASS" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Training Metrics",
    "type": "prometheus",
    "access": "proxy",
    "url": "http://client-mimir:9009/prometheus",
    "jsonData": {
      "httpHeaderName1": "X-Scope-OrgID"
    },
    "secureJsonData": {
      "httpHeaderValue1": "'"$LOADGEN_GRAFANA_TENANT"'"
    }
  }' | jq '.message'

# Test the datasource
DS_ID=$(curl -s "$GRAFANA_URL/api/datasources/name/Training%20Metrics" \
  -u "$GRAFANA_USER:$GRAFANA_PASS" | jq '.id')

curl -s "$GRAFANA_URL/api/datasources/$DS_ID/health" \
  -u "$GRAFANA_USER:$GRAFANA_PASS" | jq .
```

### Exercise 5.4 — Verify Cross-Signal Correlation

1. In Grafana Explore, select `tempo` datasource
2. Click **Search** → Run Query
3. Click any trace → expand a span
4. Click the **Logs** button — you should see log lines from `client-loki` filtered by `trace_id`

<div class="screenshot-placeholder">
[Screenshot: xTraces trace view with a span expanded and "Logs for this span" panel showing log lines from xLogs]
</div>

---

## Validation

- [ ] All three datasources show green status (✓) in Connections → Data Sources
- [ ] PromQL `rate(http_requests_total[5m])` returns data in Metrics datasource
- [ ] LogQL `{service=~".+"}` returns log streams in Logs datasource
- [ ] xTraces search returns trace results
- [ ] Clicking a trace span opens the related xLogs logs panel

---

## Troubleshooting

??? failure "Datasource returns 401"
    Verify the API key is valid and the tenant ID is correct:
    ```bash
    curl -s https://euw1-01.m.xscalerlabs.com/prometheus/api/v1/query \
      -H "Authorization: Bearer $API_KEY" \
      -H "X-Scope-OrgID: $TENANT_ID" \
      --data-urlencode 'query=up' | jq .status
    ```

??? failure "xTraces datasource: 'No traces found'"
    Check that traces are being ingested:
    ```bash
    curl -s "http://localhost:3200/api/v2/search" \
      -H "X-Scope-OrgID: $TENANT_ID" | jq .traces
    ```

??? failure "xLogs derived field TraceID not linking"
    Verify the regex matches the actual log format. Check a real log line:
    ```logql
    {service=~".+"} |= "trace_id"
    ```

---

## Key Takeaways

!!! success "Session 5.3 Summary"
    - Three datasources required: **Prometheus** (xMetrics), **xLogs**, **xTraces**
    - All three require `Authorization: Bearer xag_...` and `X-Scope-OrgID: xs_...` headers
    - Use **secureJsonData** for header values — they are stored encrypted in Grafana
    - **Derived fields** in xLogs connect log entries to traces via `trace_id`
    - **Trace to Logs** and **Trace to Metrics** enable cross-signal correlation in xTraces
    - Use YAML provisioning for GitOps-managed, reproducible datasource configuration

---

*← Previous: [Deployment Options](deployment-options.md)*  
*Next: [Session 6 Overview →](../session-6/overview.md)*
