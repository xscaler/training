# Lab 02 — Agent Deployment and Enrollment

## Objective

Verify the local dev OpAMP agent is running and enrolled, then explore the database state.

## Prerequisites

- [ ] Lab 01 completed
- [ ] Local stack running: `docker compose ps agent-1` shows `Up`

## Architecture

```mermaid
sequenceDiagram
    participant SUP as agent-1 (Supervisor)
    participant AA as agent-api :8082
    participant PG as PostgreSQL

    SUP->>AA: WebSocket xse_localdev000...
    AA->>PG: INSERT INTO agents
    AA->>PG: INSERT INTO agent_keys (xag_...)
    AA->>SUP: ConnectionSettings {xag_...}
    SUP->>AA: Reconnect with xag_...
    AA->>PG: SELECT assignments
    AA->>SUP: RemoteConfig YAML
    SUP->>AA: EffectiveConfig
    AA->>PG: agent_config_deliveries status=applied
```

## Steps

### Step 1 — Verify Agent Status

```bash
# Check if agent-1 is running
docker compose ps agent-1

# Watch agent logs
docker compose logs agent-1 --tail=30
```

### Step 2 — Inspect Database State

```bash
# Check registered agents
docker compose exec postgres psql -U xscaler -d xscaler -c "
  SELECT id, labels, last_seen_at FROM agents ORDER BY created_at DESC LIMIT 5;
"

# Check enrollment tokens
docker compose exec postgres psql -U xscaler -d xscaler -c "
  SELECT display_name, use_count, created_at FROM agent_enrollment_tokens;
"

# Check agent keys
docker compose exec postgres psql -U xscaler -d xscaler -c "
  SELECT agent_id, created_at FROM agent_keys;
"

# Check config deliveries
docker compose exec postgres psql -U xscaler -d xscaler -c "
  SELECT d.status, d.offered_at, d.applied_at
  FROM agent_config_deliveries d
  ORDER BY d.offered_at DESC LIMIT 5;
"
```

### Step 3 — Inspect the Supervisor Config

```bash
# View the local agent-1 supervisor config
cat /path/to/xscaler/deploy/agents/agent-1.supervisor.yaml
```

Key fields:
- `endpoint: ws://agent-api:8082/v1/opamp`
- `Authorization: Bearer xse_localdev0000000000000000000000`
- `accepts_remote_config: true`

### Step 4 — Trigger a Config Reload

```bash
# Manually notify agent-api of a config change
docker compose exec postgres psql -U xscaler -d xscaler -c "
  SELECT pg_notify('agent_config_changed', '{}');
"

# Watch agent-api log
docker compose logs agent-api --tail=10
```

## Validation

- [ ] `docker compose ps agent-1` shows `Up`
- [ ] Agent appears in `agents` table
- [ ] `agent_config_deliveries.status` = `applied`
- [ ] pg_notify causes agent-api to log a config push

## Expected Database Output

```
           id           |         labels          |          last_seen_at
------------------------+-------------------------+--------------------------------
 01J1234567890ABCDEF... | {"host.name": "agent-1"} | 2026-06-18 10:00:30.456+00
```

---

*← Previous: [Lab 01](lab-01-tenant-creation.md)*  
*Next: [Lab 03 — Agent Registration →](lab-03-registration.md)*
