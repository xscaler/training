# Lab 05 — Dashboard Creation

## Objective

Build a four golden signals service dashboard with PromQL and LogQL panels.

## Prerequisites

- [ ] Lab 04 completed (all datasources verified)
- [ ] Grafana accessible at `https://<slug>.g.xscalerlabs.com`

## Steps

### Step 1 — Create a New Dashboard

1. In Grafana: **Dashboards → New → New Dashboard**
2. Click **Add panel**

### Step 2 — Add Request Rate Panel

- Datasource: `client-mimir`
- Query:
```promql
sum by (job) (rate(up[$__rate_interval]))
```
- Visualization: **Time series**
- Title: `Request Rate`
- Unit: `requests/sec`

### Step 3 — Add Error Rate Panel

- Query:
```promql
sum(rate(cortex_request_duration_seconds_count{status_code=~"5.."}[$__rate_interval]))
/ sum(rate(cortex_request_duration_seconds_count[$__rate_interval])) * 100
```
- Visualization: **Time series**
- Title: `Error Rate`
- Unit: `percent (0-100)`
- Threshold: yellow at 0.5, red at 1.0

### Step 4 — Add Latency Panel

- Query:
```promql
histogram_quantile(0.99, sum by (le) (
  rate(cortex_request_duration_seconds_bucket[$__rate_interval])
))
```
- Visualization: **Time series**
- Title: `p99 Latency`
- Unit: `seconds`

### Step 5 — Add Log Volume Panel

- Datasource: `client-loki`
- Query:
```logql
sum by (level) (count_over_time({service=~".+"}[$__interval]))
```
- Visualization: **Time series**
- Title: `Log Volume by Level`

### Step 6 — Save the Dashboard

- Click **Save** → Name: `Lab05: Golden Signals`

<div class="screenshot-placeholder">
[Screenshot: Completed Lab05 dashboard showing four panels: request rate, error rate, p99 latency, and log volume]
</div>

## Validation

- [ ] Dashboard saved as `Lab05: Golden Signals`
- [ ] All four panels display data
- [ ] Error rate panel has thresholds (yellow/red)
- [ ] Log volume panel shows level breakdown

---

*← Previous: [Lab 04](lab-04-grafana.md)*  
*Next: [Lab 06 — Alerting →](lab-06-alerting.md)*
