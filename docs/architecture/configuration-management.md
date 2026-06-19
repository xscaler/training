# Configuration Management Flow

## Architecture

```mermaid
sequenceDiagram
    participant ADM as Portal Admin
    participant PA as portal-api
    participant PG as PostgreSQL
    participant AA as agent-api
    participant KMS as AWS KMS
    participant AG as OTel Agent (Supervisor)
    participant COL as otelcol-contrib

    Note over ADM: Creates new config revision
    ADM->>PA: POST /agent/templates/{id}/revisions\n{config_yaml with ${secret:NAME} refs}
    PA->>PG: INSERT agent_config_template_revisions\n{revision=N+1, config_yaml}

    Note over ADM: Creates assignment
    ADM->>PA: POST /agent/assignments\n{revision_id, label_selector: {env: prod}, priority: 50}
    PA->>PG: INSERT agent_config_assignments
    PG->>PG: Trigger: NOTIFY 'agent_config_changed'

    Note over AA: Receives NOTIFY from PostgreSQL
    PG-->>AA: LISTEN notification {org_id}
    AA->>PG: SELECT assignments WHERE org_id = ... ORDER BY priority DESC
    AA->>PG: SELECT connected agents WHERE org_id = ... AND labels MATCH selectors

    loop For each matching agent
        AA->>PG: SELECT secret ciphertexts WHERE name IN (${secret:*} refs)
        AA->>KMS: Decrypt(ciphertext, kms_key_id)
        KMS->>AA: plaintext secret values
        AA->>AA: Substitute ${secret:NAME} → plaintext
        AA->>PG: INSERT agent_config_deliveries {status='offered'}
        AA->>AG: OpAMP: ServerToAgent {RemoteConfig: resolved_yaml}
    end

    AG->>COL: Write config file, restart process
    COL->>COL: Load new config
    AG->>AA: AgentToServer {EffectiveConfig: running_config}
    AA->>AA: redactEffectiveConfig() — remove plaintext secrets
    AA->>PG: UPDATE agent_config_deliveries SET status='applied'
```

## Config Template Versioning

```mermaid
graph LR
    T[Template: Prod K8s Agent]
    R1[Revision 1 Base OTLP config]
    R2[Revision 2 + hostmetrics]
    R3[Revision 3 + attributes processor]

    T --> R1 --> R2 --> R3

    A1[Assignment priority 0 label: {}]
    A2[Assignment priority 50 label: {team:db}]

    R3 --> A1 & A2
    A1 -->|matches all| AGENTS[All Agents]
    A2 -->|matches DB team| DB_AGENTS[DB Team Agents]
```

Revisions are **immutable** — creating a new revision does not modify existing ones. Rollback is achieved by creating a new assignment pointing to a previous revision at higher priority.

---

*← Previous: [Multi-Tenant Architecture](multi-tenant.md)*  
*Next: [Agent Mode →](agent-mode.md)*
