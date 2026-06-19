# Lab 03 — Agent Registration and Config Templates

## Objective

Explore config template structure, assignment logic, and the secret placeholder system.

## Prerequisites

- [ ] Lab 02 completed
- [ ] Agent enrolled and showing `applied` status

## Steps

### Step 1 — View Config Templates

```bash
docker compose exec postgres psql -U xscaler -d xscaler -c "
  SELECT t.display_name, r.revision, r.created_at
  FROM agent_config_template_revisions r
  JOIN agent_config_templates t ON r.template_id = t.id
  ORDER BY r.created_at;
"
```

### Step 2 — Read the Seeded Config YAML

```bash
docker compose exec postgres psql -U xscaler -d xscaler -c "
  SELECT config_yaml FROM agent_config_template_revisions LIMIT 1;
" -t -A
```

Expected: A minimal OTel YAML with OTLP receivers and a debug exporter.

### Step 3 — Inspect Assignments

```bash
docker compose exec postgres psql -U xscaler -d xscaler -c "
  SELECT
    a.label_selector,
    a.priority,
    r.revision,
    substring(r.config_yaml, 1, 80) AS config_preview
  FROM agent_config_assignments a
  JOIN agent_config_template_revisions r ON a.revision_id = r.id
  ORDER BY a.priority DESC;
"
```

### Step 4 — Verify Seed Data

```bash
# View the seed SQL to understand what was pre-loaded
cat /path/to/xscaler/scripts/agents/seed-local.sql
```

Key entries:
- Enrollment token hash (SHA-256 of `xse_localdev0000000000000000000000`)
- Config template revision 1
- Assignment with empty label selector `{}` (matches all agents)

## Validation

- [ ] At least one config template exists
- [ ] Assignment has `label_selector: {}` (matches all agents)
- [ ] Delivery status shows `applied`

---

*← Previous: [Lab 02](lab-02-agent-deployment.md)*  
*Next: [Lab 04 — Grafana Setup →](lab-04-grafana.md)*
