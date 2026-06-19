# Agent Mode Architecture

## Overview

In Agent Mode, an OTel Collector is deployed on each host (as a DaemonSet in Kubernetes) and managed remotely via the OpAMP protocol through `agent-api`.

```mermaid
graph TB
    subgraph "Customer K8s Node 1"
        APP1[App Pod: service-a]
        APP2[App Pod: service-b]
        SUP1[OpAMP Supervisor DaemonSet Pod]
        COL1[otelcol-contrib managed by supervisor]
        APP1 & APP2 -->|OTLP :4317| COL1
        SUP1 -->|manage process| COL1
    end

    subgraph "Customer K8s Node 2"
        APP3[App Pod: service-c]
        SUP2[OpAMP Supervisor DaemonSet Pod]
        COL2[otelcol-contrib]
        APP3 -->|OTLP :4317| COL2
        SUP2 -->|manage process| COL2
    end

    subgraph "xScaler Control"
        AA[agent-api :8082]
        PG[(PostgreSQL)]
    end

    subgraph "xScaler Edge"
        EN[Envoy Gateway]
    end

    SUP1 & SUP2 <-->|OpAMP WebSocket wss://| AA
    AA <-->|NOTIFY/LISTEN| PG
    COL1 & COL2 -->|HTTPS metrics/logs/traces| EN
```

## Supervisor Config (from ``)

```yaml
server:
  endpoint: ws://agent-api:8082/v1/opamp
  headers:
    Authorization: "Bearer xse_<enrollment-token>"

capabilities:
  accepts_remote_config: true
  reports_effective_config: true
  reports_remote_config: true
  reports_health: true

agent:
  executable: /usr/local/bin/otelcol-contrib
  description:
    non_identifying_attributes:
      host.name: "${HOSTNAME}"

storage:
  directory: /var/lib/otelcol-supervisor
```

## Key Properties

| Property | Value | Notes |
|---|---|---|
| Protocol | WebSocket (OpAMP) | Bidirectional, persistent connection |
| Endpoint | `/v1/opamp` on agent-api | Configurable via `cfg.OpAMPPath` |
| Enrollment | `xse_` token → `xag_` key | Two-phase exchange |
| Stale threshold | 90 seconds | Configurable in Helm values |
| Stale sweep interval | 30 seconds | Background goroutine in agent-api |
| Config push trigger | PostgreSQL NOTIFY | Near real-time |

---

*← Previous: [Configuration Management](configuration-management.md)*  
*Next: [Gateway Mode →](gateway-mode.md)*
