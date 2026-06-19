# Lab 06 — Alerting

## Objective

Create an alert rule, configure a contact point, and observe the full alert lifecycle.

## Prerequisites

- [ ] Lab 05 completed (dashboard exists)
- [ ] Grafana accessible at `https://<slug>.g.xscalerlabs.com`

## Steps

### Step 1 — Create a Contact Point

1. Navigate to **Alerting → Contact points → + Add contact point**
2. Name: `Lab06 Email`
3. Type: **Email**
4. Addresses: `lab@example.com`
5. Click **Test** (will log, not actually send in dev)
6. Click **Save**

### Step 2 — Create an Alert Rule

1. Navigate to **Alerting → Alert rules → + New alert rule**
2. Name: `Lab06: High Error Rate`
3. Datasource: `client-mimir`
4. Query A:
```promql
vector(1)
```
*(This always returns 1 — triggers immediately for testing)*

5. Condition: **IS ABOVE** `0`
6. For: `30s`
7. Labels: `severity=warning`, `lab=lab06`
8. Annotations:
   - Summary: `Lab06 test alert firing`
   - Description: `Error rate exceeds threshold`
9. Click **Save rule and exit**

### Step 3 — Observe Alert Lifecycle

```bash
# Poll alert state every 5 seconds
for i in {1..12}; do
  curl -s "https://<slug>.g.xscalerlabs.com/api/alertmanager/grafana/api/v2/alerts" \
    -u "admin:admin" | jq '.[].status.state' 2>/dev/null
  sleep 5
done
```

Expected progression:
```
null          (no alert yet)
"pending"     (waiting for For duration)
"firing"      (threshold exceeded for 30s)
```

### Step 4 — Silence the Alert

1. In **Alerting → Alert rules**, click the firing alert
2. Click **Silence**
3. Duration: 10 minutes
4. Click **Create**

<div class="screenshot-placeholder">
[Screenshot: Grafana alert rules page showing Lab06 High Error Rate in "firing" state with red badge]
</div>

### Step 5 — Delete the Test Alert

After observing the full lifecycle, delete the test alert:

1. **Alerting → Alert rules** → find `Lab06: High Error Rate`
2. Click the three-dot menu → **Delete**
3. Confirm deletion

## Validation

- [ ] Contact point created and shows in list
- [ ] Alert transitions through Normal → Pending → Firing
- [ ] Silence mutes the alert
- [ ] Alert lifecycle visible in **Alerting → Alert history**

## Expected Output

```
Alert state: normal
Alert state: pending  (after creation)
Alert state: firing   (after 30 seconds)
Alert state: inactive (after silence)
```

---

*← Previous: [Lab 05](lab-05-dashboard.md)*  
*Next: [Collector Configurations →](../appendix/collector-configurations.md)*
