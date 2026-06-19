# xScaler Platform — Architecture Diagrams
## Mermaid Diagram Collection
**Based on:** Repository analysis of `/Users/pathum.fernando/Projects/xscaler/xscaler`

---

## Diagram A — High-Level Platform Architecture

```mermaid
graph TB
    subgraph Users["Users & Clients"]
        UA[Admin User<br/>Browser]
        APP[Customer Application<br/>with OTel SDK]
        AG[OTel Collector Agent<br/>opamp-supervisor]
    end

    subgraph ControlPlane["Control Plane — System Cluster (AWS EKS)"]
        PW[portal-web<br/>Next.js :3000]
        PA[portal-api<br/>Go :8081]
        AAP[agent-api<br/>Go :8082<br/>OpAMP Server]
        MS[mimir-sync<br/>Go Daemon]
        SMIMIR[system-mimir<br/>Grafana Mimir :9009]
        PG[(PostgreSQL<br/>:5432)]
        ARGO[ArgoCD<br/>GitOps Controller]
        PROV[provisiond<br/>Managed Grafana<br/>Provisioner]
        STRIPE[Stripe<br/>Billing API]
        COGNITO[Amazon Cognito<br/>Identity Provider]
    end

    subgraph EdgeEUW1["Edge Cluster — euw1-01 (EU West)"]
        subgraph EnvoyEdge["Envoy Gateway"]
            EMetrics[Envoy :8080<br/>Metrics]
            ELogs[Envoy :8181<br/>Logs]
            ETraces[Envoy :8282/:4317<br/>Traces]
        end
        subgraph ProxyAuth["proxy-auth (per signal)"]
            PAM[proxy-auth<br/>metrics :9001]
            PAL[proxy-auth-logs<br/>:9001]
            PAT[proxy-auth-traces<br/>:9001]
        end
        MIMIR[Grafana Mimir<br/>Metrics Backend]
        LOKI[Grafana Loki<br/>Logs Backend]
        TEMPO[Grafana Tempo<br/>Traces Backend]
        OTELC[OTel Collector<br/>Edge Scraper]
    end

    subgraph Storage["Object Storage (AWS S3)"]
        S3M[S3 Bucket<br/>Metrics Blocks]
        S3L[S3 Bucket<br/>Log Chunks]
        S3T[S3 Bucket<br/>Trace Blocks]
    end

    subgraph ManagedGrafana["Managed Grafana (Per Org)"]
        MG[Grafana OSS<br/>Per-tenant instance]
    end

    UA -->|HTTPS| PW
    PW -->|REST /api/portal/*| PA
    UA -->|WSS /v1/opamp| AAP
    AG -->|OpAMP WebSocket| AAP

    PA -->|JWT Auth| COGNITO
    PA -->|Billing Meters| STRIPE
    PA <-->|Read/Write| PG
    AAP <-->|Read/Write| PG
    MS -->|PromQL| SMIMIR
    MS -->|UPSERT tenant_usage| PG

    APP -->|OTLP / Prom remote_write<br/>Bearer token| EMetrics
    APP -->|OTLP / Loki push<br/>Bearer token| ELogs
    APP -->|OTLP traces<br/>Bearer token| ETraces

    EMetrics -->|gRPC Check| PAM
    ELogs -->|gRPC Check| PAL
    ETraces -->|gRPC Check| PAT

    PAM -->|snapshot lookup| PA
    PAL -->|snapshot lookup| PA
    PAT -->|snapshot lookup| PA

    EMetrics -->|X-Scope-OrgID| MIMIR
    ELogs -->|X-Scope-OrgID| LOKI
    ETraces -->|X-Scope-OrgID| TEMPO

    MIMIR --> S3M
    LOKI --> S3L
    TEMPO --> S3T

    OTELC -->|scrapes| MIMIR
    OTELC -->|remote_write| SMIMIR

    MG -->|Prom datasource| EMetrics
    MG -->|Loki datasource| ELogs
    MG -->|Tempo datasource| ETraces
    PROV -->|provisions| MG

    ARGO -->|syncs Helm releases| EdgeEUW1

    style ControlPlane fill:#dbeafe,stroke:#2563eb
    style EdgeEUW1 fill:#dcfce7,stroke:#16a34a
    style Storage fill:#fef9c3,stroke:#ca8a04
    style ManagedGrafana fill:#fce7f3,stroke:#db2777
```

---

## Diagram B — OpenTelemetry Agent Mode Architecture

```mermaid
graph TB
    subgraph HostMachine["Customer Host / Kubernetes Node"]
        APP1[Application 1<br/>OTel SDK instrumented]
        APP2[Application 2<br/>OTel SDK instrumented]
        PROC[Process<br/>metrics, JVM, etc.]

        subgraph AgentMode["OTel Collector — Agent Mode"]
            direction TB
            RCV[Receivers<br/>OTLP gRPC :4317<br/>OTLP HTTP :4318<br/>Prometheus Scrape<br/>hostmetrics]
            PRC[Processors<br/>memory_limiter<br/>batch<br/>resourcedetection<br/>attributes]
            EXP[Exporters<br/>prometheusremotewrite<br/>otlphttp/loki<br/>otlphttp/tempo]
        end

        SUPV[OpAMP Supervisor<br/>manages collector lifecycle]
    end

    subgraph AgentAPI["xScaler Agent-API (Control Plane)"]
        OPAMP[OpAMP Server<br/>agent-api :8082]
        TMPL[Config Templates<br/>+ Assignments DB]
        PUSH[Push via<br/>Postgres NOTIFY]
    end

    subgraph XScalerEdge["xScaler Edge (Envoy + Backends)"]
        MENV[Envoy :8080<br/>Metrics Edge]
        LENV[Envoy :8181<br/>Logs Edge]
        TENV[Envoy :8282/:4317<br/>Traces Edge]
    end

    APP1 -->|OTLP gRPC| RCV
    APP2 -->|OTLP HTTP| RCV
    PROC -->|Prometheus scrape| RCV

    RCV --> PRC
    PRC --> EXP

    EXP -->|Prom remote_write<br/>Bearer token + X-Scope-OrgID| MENV
    EXP -->|Loki push<br/>Bearer token + X-Scope-OrgID| LENV
    EXP -->|OTLP traces<br/>Bearer token + X-Scope-OrgID| TENV

    SUPV <-->|OpAMP WebSocket<br/>xag_ agent key| OPAMP
    OPAMP -->|RemoteConfig YAML| SUPV
    SUPV -->|manages| AgentMode

    TMPL -->|label-selector match| OPAMP
    PUSH -->|pg_notify agent_config_changed| OPAMP

    style AgentMode fill:#dcfce7,stroke:#16a34a
    style AgentAPI fill:#dbeafe,stroke:#2563eb
    style XScalerEdge fill:#fef3c7,stroke:#d97706
```

---

## Diagram C — OpenTelemetry Gateway Mode Architecture

```mermaid
graph TB
    subgraph Apps["Applications (Multiple Hosts/Services)"]
        SVC1[Service A<br/>Java + OTel SDK]
        SVC2[Service B<br/>Go + OTel SDK]
        SVC3[Service C<br/>Python + OTel SDK]
        INFRA[Infrastructure<br/>Kubernetes node exporter<br/>kube-state-metrics]
    end

    subgraph Gateway["OTel Collector — Gateway Mode (Shared/Centralised)"]
        subgraph GW["Gateway Collector"]
            direction LR
            RECV[Receivers<br/>otlp gRPC :4317<br/>otlp HTTP :4318<br/>prometheus scrape<br/>k8scluster]
            PROC[Processors<br/>memory_limiter<br/>batch<br/>k8sattributes<br/>resource]
            GRPEXP[Exporters<br/>prometheusremotewrite → Metrics<br/>otlphttp/loki → Logs<br/>otlphttp/tempo → Traces]
        end
    end

    subgraph EdgeCluster["xScaler Edge Cluster"]
        subgraph MetricsPath["Metrics Path"]
            ME[Envoy :8080] --> PAM[proxy-auth] --> MIM[Mimir]
        end
        subgraph LogsPath["Logs Path"]
            LE[Envoy :8181] --> PAL[proxy-auth-logs] --> LOK[Loki]
        end
        subgraph TracesPath["Traces Path"]
            TE[Envoy :8282] --> PAT[proxy-auth-traces] --> TMP[Tempo]
        end
    end

    subgraph S3["Object Storage"]
        SM[S3 Metrics]
        SL[S3 Logs]
        ST[S3 Traces]
    end

    SVC1 -->|OTLP| RECV
    SVC2 -->|OTLP| RECV
    SVC3 -->|OTLP| RECV
    INFRA -->|Prom scrape| RECV

    RECV --> PROC --> GRPEXP

    GRPEXP -->|remote_write + Bearer + X-Scope-OrgID| ME
    GRPEXP -->|Loki push + Bearer + X-Scope-OrgID| LE
    GRPEXP -->|OTLP + Bearer + X-Scope-OrgID| TE

    MIM --> SM
    LOK --> SL
    TMP --> ST

    style Gateway fill:#dcfce7,stroke:#16a34a
    style EdgeCluster fill:#fef3c7,stroke:#d97706
    style S3 fill:#fce7f3,stroke:#db2777
```

---

## Diagram D — End-to-End Telemetry Flow (Metrics)

```mermaid
sequenceDiagram
    participant App as Application<br/>(OTel SDK)
    participant Coll as OTel Collector<br/>(Agent / Gateway)
    participant ALB as AWS ALB
    participant Envoy as Envoy :8080
    participant PAuth as proxy-auth :9001
    participant PortalAPI as portal-api :8081
    participant Mimir as Mimir Distributor
    participant Ing as Mimir Ingester
    participant S3 as AWS S3
    participant MS as mimir-sync
    participant PG as PostgreSQL
    participant Grafana as Grafana

    App->>Coll: Instrument & export OTLP metrics
    Coll->>ALB: POST /api/v1/push<br/>Authorization: Bearer xag_...<br/>X-Scope-OrgID: xs_acme_ab3cd4ef

    ALB->>Envoy: TCP :8080
    Envoy->>PAuth: gRPC Check()<br/>{Authorization, X-Scope-OrgID, path}
    PAuth->>PAuth: lookup cache (SHA256 hash)

    alt Cache miss / stale
        PAuth->>PortalAPI: GET /internal/proxy-auth/snapshot<br/>?token_hash=sha256&tenant_hint=xs_acme_ab3cd4ef
        PortalAPI->>PortalAPI: lookup api_keys by hash
        PortalAPI-->>PAuth: {authorized, tenant_id, plan, limits}
        PAuth->>PAuth: cache 10s
    end

    PAuth-->>Envoy: CheckResponse OK<br/>inject X-Scope-OrgID: xs_acme_ab3cd4ef<br/>X-Xscalor-Plan: scale

    Envoy->>Mimir: POST /prometheus/api/v1/push<br/>X-Scope-OrgID: xs_acme_ab3cd4ef
    Mimir->>Ing: replicate samples
    Ing->>Ing: TSDB ingest, bump active_series
    Ing->>S3: ship blocks (1m interval)
    Ing-->>Envoy: 204 No Content
    Envoy-->>ALB: 204
    ALB-->>Coll: 204 OK

    Note over MS, PG: Every 60s (out-of-band)
    MS->>Mimir: PromQL active_series per tenant
    Mimir-->>MS: series count
    MS->>PG: UPSERT tenant_usage, dashboard_tenant_hourly

    Grafana->>Envoy: GET /api/v1/query?query=up<br/>Authorization: Bearer xag_...<br/>X-Scope-OrgID: xs_acme_ab3cd4ef
    Envoy->>PAuth: gRPC Check()
    PAuth-->>Envoy: OK
    Envoy->>Mimir: GET /prometheus/api/v1/query<br/>X-Scope-OrgID: xs_acme_ab3cd4ef
    Mimir-->>Grafana: JSON results
```

---

## Diagram E — Multi-Tenant Architecture

```mermaid
graph TB
    subgraph ControlPlane["Control Plane"]
        PA[portal-api]
        PG[(PostgreSQL)]
        PA --> PG
    end

    subgraph TenantA["Organization A (xs_org_aaa...)"]
        TA1[Tenant: xs_acme_prod1<br/>cluster: euw1-01<br/>plan: Scale]
        TA2[Tenant: xs_acme_staging<br/>cluster: euw1-01<br/>plan: Free]
        KEY_A[API Keys<br/>SHA256 hashed]
    end

    subgraph TenantB["Organization B (xs_org_bbb...)"]
        TB1[Tenant: xs_corp_prod<br/>cluster: euw1-01<br/>plan: Enterprise]
        KEY_B[API Keys<br/>SHA256 hashed]
    end

    subgraph EdgeEUW1["Edge Cluster euw1-01"]
        subgraph Boundary_A1["Isolation Boundary: xs_acme_prod1"]
            M_A1[Mimir: X-Scope-OrgID=xs_acme_prod1<br/>Metrics isolated]
            L_A1[Loki: X-Scope-OrgID=xs_acme_prod1<br/>Logs isolated]
            T_A1[Tempo: X-Scope-OrgID=xs_acme_prod1<br/>Traces isolated]
        end
        subgraph Boundary_A2["Isolation Boundary: xs_acme_staging"]
            M_A2[Mimir: X-Scope-OrgID=xs_acme_staging<br/>Metrics isolated]
            L_A2[Loki: X-Scope-OrgID=xs_acme_staging<br/>Logs isolated]
        end
        subgraph Boundary_B1["Isolation Boundary: xs_corp_prod"]
            M_B1[Mimir: X-Scope-OrgID=xs_corp_prod<br/>Metrics isolated]
            L_B1[Loki: X-Scope-OrgID=xs_corp_prod<br/>Logs isolated]
            T_B1[Tempo: X-Scope-OrgID=xs_corp_prod<br/>Traces isolated]
        end
        PA_AUTH[proxy-auth<br/>enforces X-Scope-OrgID<br/>matches API key tenant]
    end

    subgraph Storage["S3 — Shared Bucket, Isolated Prefixes"]
        S3_M[Mimir blocks/<br/>xs_acme_prod1/<br/>xs_acme_staging/<br/>xs_corp_prod/]
        S3_L[Loki chunks/<br/>xs_acme_prod1/<br/>xs_acme_staging/<br/>xs_corp_prod/]
        S3_T[Tempo blocks/<br/>xs_acme_prod1/<br/>xs_corp_prod/]
    end

    PG -->|tenant registry| TenantA
    PG -->|tenant registry| TenantB

    KEY_A -->|Bearer + X-Scope-OrgID| PA_AUTH
    KEY_B -->|Bearer + X-Scope-OrgID| PA_AUTH

    PA_AUTH -->|validated, routed| Boundary_A1
    PA_AUTH -->|validated, routed| Boundary_A2
    PA_AUTH -->|validated, routed| Boundary_B1

    M_A1 --> S3_M
    M_A2 --> S3_M
    M_B1 --> S3_M
    L_A1 --> S3_L
    L_A2 --> S3_L
    L_B1 --> S3_L
    T_A1 --> S3_T
    T_B1 --> S3_T

    style Boundary_A1 fill:#dcfce7,stroke:#16a34a
    style Boundary_A2 fill:#dbeafe,stroke:#2563eb
    style Boundary_B1 fill:#fce7f3,stroke:#db2777
    style Storage fill:#fef9c3,stroke:#ca8a04
```

---

## Diagram F — Configuration Management Flow (OpAMP)

```mermaid
sequenceDiagram
    participant Admin as Platform Admin<br/>(portal-web)
    participant PortalAPI as portal-api<br/>:8081
    participant PG as PostgreSQL
    participant AgentAPI as agent-api<br/>:8082 (OpAMP)
    participant Supervisor as OpAMP Supervisor<br/>(on customer host)
    participant Collector as otelcol-contrib<br/>(managed process)

    Note over Admin,Collector: Initial Agent Enrollment

    Supervisor->>AgentAPI: WebSocket CONNECT<br/>Authorization: Bearer xse_localdev...
    AgentAPI->>PG: ValidateEnrollmentToken(hash)
    PG-->>AgentAPI: {org_id, tenant_id, default_labels}
    AgentAPI->>PG: UpsertAgent(instance_uid, labels)
    AgentAPI->>PG: MintAgentKey(agent_id, key_hash)
    AgentAPI->>Supervisor: ConnectionSettingsOffers<br/>{new key: xag_..., endpoint: wss://...}
    AgentAPI->>PG: FetchAssignments(org_id)
    PG-->>AgentAPI: [{template_id, label_selector, priority}]
    AgentAPI->>PG: ResolveSecretValues(org_id, secret_names)
    AgentAPI->>Supervisor: RemoteConfig YAML<br/>(hash: sha256...)
    Supervisor->>Collector: write config, restart
    Supervisor-->>AgentAPI: RemoteConfigStatus=APPLIED

    Note over Admin,Collector: Config Update Flow

    Admin->>PortalAPI: PUT /agents/configs/{id}/revisions<br/>new YAML body
    PortalAPI->>PG: INSERT agent_config_template_revisions
    PortalAPI->>PG: pg_notify('agent_config_changed', org_id)

    PG->>AgentAPI: NOTIFY agent_config_changed<br/>payload: org_id

    AgentAPI->>PG: FetchAssignments(org_id)
    AgentAPI->>PG: OrgAgentLabels(org_id)
    AgentAPI->>Supervisor: RemoteConfig (new hash)

    Supervisor->>Supervisor: compare config hash
    Supervisor->>Collector: graceful restart with new config
    Supervisor-->>AgentAPI: RemoteConfigStatus=APPLYING
    Supervisor-->>AgentAPI: RemoteConfigStatus=APPLIED

    AgentAPI->>PG: RecordDelivery(agent_id, hash, "applied")

    Note over Admin,Collector: Rollback Flow

    Admin->>PortalAPI: PUT /agents/configs/{id}/assignments<br/>revision=N-1 (older revision)
    PortalAPI->>PG: UPDATE agent_config_assignments → older revision
    PortalAPI->>PG: pg_notify('agent_config_changed', org_id)
    PG->>AgentAPI: NOTIFY
    AgentAPI->>Supervisor: RemoteConfig (previous hash)
    Supervisor->>Collector: restart with previous config
    Supervisor-->>AgentAPI: RemoteConfigStatus=APPLIED
```

---

## Diagram G — Authentication & Authorization Flow

```mermaid
flowchart TD
    subgraph ControlPlane["Control Plane Auth"]
        U([User]) -->|1. OIDC login| COG[Amazon Cognito]
        COG -->|2. id_token| PW[portal-web]
        PW -->|3. POST /auth/cognito/exchange<br/>Cognito token| PA[portal-api]
        PA -->|4. Validate Cognito token| COG
        PA -->|5. Generate xScaler JWT<br/>HS256, 30m TTL| PW
        PW -->|6. HttpOnly cookie| BROWSER[Browser Session]
        BROWSER -->|7. All API calls<br/>Authorization: Bearer JWT| PA
    end

    subgraph DataPlane["Data Plane Auth"]
        AGENT([OTel Agent]) -->|1. POST /api/v1/push<br/>Authorization: Bearer API_KEY| ENV[Envoy]
        ENV -->|2. gRPC Check()| PAUTH[proxy-auth]
        PAUTH -->|3. SHA256 hash of token| PAUTH
        PAUTH -->|4. GET /internal/proxy-auth/snapshot<br/>token_hash=sha256| PA2[portal-api]
        PA2 -->|5. lookup api_keys table| PG[(PostgreSQL)]
        PG -->|6. {tenant_id, plan, limits}| PA2
        PA2 -->|7. snapshot response| PAUTH
        PAUTH -->|8. CheckResponse<br/>inject headers| ENV
        ENV -->|9. X-Scope-OrgID: tenant_id<br/>X-Xscalor-Plan: scale| BACKEND[Mimir/Loki/Tempo]
    end

    subgraph AgentMgmt["Agent Management Auth"]
        AG([OTel Supervisor]) -->|1. WebSocket Bearer xse_...| AAPI[agent-api]
        AAPI -->|2. Validate enrollment token| PG2[(PostgreSQL)]
        AAPI -->|3. Mint agent key xag_...| PG2
        AAPI -->|4. Offer xag_ key| AG
        AG -->|5. Reconnect Bearer xag_...| AAPI
        AAPI -->|6. Push RemoteConfig| AG
    end

    style ControlPlane fill:#dbeafe,stroke:#2563eb
    style DataPlane fill:#dcfce7,stroke:#16a34a
    style AgentMgmt fill:#fef3c7,stroke:#d97706
```

---

## Diagram H — Billing & Usage Flow

```mermaid
graph TB
    subgraph Collection["Usage Data Collection"]
        MIMIR[Mimir<br/>active_series counter]
        MSYNC[mimir-sync<br/>polls every 60s]
        PG[(PostgreSQL<br/>tenant_usage<br/>dashboard_tenant_hourly)]

        MIMIR -->|PromQL queries| MSYNC
        MSYNC -->|UPSERT| PG
    end

    subgraph Reporting["Usage Reporting (CronJob)"]
        UR[usage-reporter<br/>daily 02:15 UTC]
        PG -->|billing period rollup| UR
        UR -->|p95 active_series<br/>minus free quota| UR
    end

    subgraph Stripe["Stripe Billing"]
        SMETER[Stripe Meter API<br/>active_series meter<br/>logs_gb_ingested meter]
        SSUB[Stripe Subscription<br/>Scale: $19 base<br/>+ metered addons]
        SINV[Stripe Invoice<br/>generated monthly]

        UR -->|meter events| SMETER
        SMETER -->|aggregates| SSUB
        SSUB -->|generates| SINV
    end

    subgraph Plans["Plan Enforcement (proxy-auth)"]
        FREE_CAP[Free Plan<br/>Hard cap: 20k series<br/>Hard cap: 50 GB logs<br/>HTTP 429 over limit]
        SCALE_METER[Scale Plan<br/>$19 base covers 20k<br/>Metered above]

        PG -->|tenant_usage| FREE_CAP
        PG -->|dashboard rollups| SCALE_METER
    end

    style Collection fill:#dcfce7,stroke:#16a34a
    style Reporting fill:#dbeafe,stroke:#2563eb
    style Stripe fill:#fef9c3,stroke:#ca8a04
    style Plans fill:#fce7f3,stroke:#db2777
```

---

## Diagram I — Managed Grafana Provisioning

```mermaid
sequenceDiagram
    participant Admin as Org Admin<br/>(portal-web)
    participant PA as portal-api
    participant PG as PostgreSQL
    participant PROV as provisiond<br/>(edge cluster)
    participant K8S as Kubernetes<br/>(edge cluster)
    participant GR as Grafana Instance<br/>(per org)
    participant Stripe as Stripe

    Admin->>PA: POST /settings/managed-grafana<br/>{replicas: 2, version: "10.x"}
    PA->>PG: INSERT managed_grafanas<br/>phase=provisioning
    PA-->>Admin: 202 Accepted

    loop Every poll interval
        PROV->>PA: GET /internal/managed-grafana/desired<br/>Authorization: Bearer PROVISIONER_TOKEN
        PA->>PG: SELECT managed_grafanas WHERE phase != ready
        PG-->>PA: [{org_id, replicas, db_creds, ...}]
        PA-->>PROV: desired state JSON
    end

    PROV->>K8S: create namespace, Helm install Grafana
    PROV->>K8S: create Postgres DB + role for org
    PROV->>PA: POST /internal/managed-grafana/phase<br/>{grafana_id, phase: ready}
    PA->>PG: UPDATE managed_grafanas SET phase=ready

    loop Every 15 min (Grafana usage reporter CronJob)
        PA->>Stripe: POST meter event grafana_active_hours<br/>value=replicas, identifier=org_gfn_hour
        Stripe->>Stripe: aggregate for invoice
    end

    Admin->>GR: Access Grafana at<br/>https://grafana-<org>.xscalerlabs.com
```

---

## Diagram J — Regional Deployment & Scaling

```mermaid
graph TB
    subgraph Global["Global Control Plane"]
        PA[portal-api]
        PG[(PostgreSQL)]
        ARGO[ArgoCD]
    end

    subgraph RegionEUW1["Region: EU West 1"]
        subgraph EKS_EUW1["EKS Cluster: xscaler-prod-edge-euw1-01"]
            MIM_EUW1[Mimir<br/>euw1-01.m.xscalerlabs.com]
            LOK_EUW1[Loki<br/>euw1-01.l.xscalerlabs.com]
            TMP_EUW1[Tempo<br/>euw1-01.t.xscalerlabs.com]
            ENV_EUW1[Envoy Gateway]
            PAU_EUW1[proxy-auth ×3]
        end
        S3_EUW1[S3 eu-west-1<br/>Metrics + Logs + Traces]
        RDS_EUW1[RDS PostgreSQL<br/>Managed Grafana DBs]
    end

    subgraph RegionAPS1["Region: AP South 1 (Future)"]
        subgraph EKS_APS1["EKS Cluster: xscaler-prod-edge-aps1-01"]
            MIM_APS1[Mimir<br/>aps1-01.m.xscalerlabs.com]
            LOK_APS1[Loki<br/>aps1-01.l.xscalerlabs.com]
        end
        S3_APS1[S3 ap-south-1]
    end

    PA -->|tenant cluster_id assignment| PG
    PG -->|clusters table: euw1-01| MIM_EUW1
    PG -->|clusters table: aps1-01| MIM_APS1

    ARGO -->|Helm releases via ArgoCD Apps| EKS_EUW1
    ARGO -->|Helm releases via ArgoCD Apps| EKS_APS1

    MIM_EUW1 --> S3_EUW1
    LOK_EUW1 --> S3_EUW1
    TMP_EUW1 --> S3_EUW1

    MIM_APS1 --> S3_APS1
    LOK_APS1 --> S3_APS1

    style Global fill:#dbeafe,stroke:#2563eb
    style RegionEUW1 fill:#dcfce7,stroke:#16a34a
    style RegionAPS1 fill:#fef3c7,stroke:#d97706
```
