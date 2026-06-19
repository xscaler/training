# Gateway Mode Architecture

## Overview

In Gateway Mode, one or more centralised OTel Collector instances receive from all application pods and forward to xScaler. No OpAMP supervision is used — configuration is managed via Kubernetes ConfigMaps or Helm.

```mermaid
graph TB
    subgraph "Application Tier (any namespace)"
        A1[Service A\nOTLP → :4317]
        A2[Service B\nOTLP → :4317]
        A3[Service C\nOTLPHTTP → :4318]
        A4[Service D\nPrometheus /metrics]
    end

    subgraph "Monitoring Namespace"
        SVC[otel-gateway Service\nClusterIP :4317/:4318]
        GW1[otel-gateway Pod 1]
        GW2[otel-gateway Pod 2]
        CM[ConfigMap:\notel-gateway-config]
    end

    subgraph "xScaler Edge"
        EN[Envoy Gateway]
        MI[xMetrics]
        LO[xLogs]
        TE[xTraces]
    end

    A1 & A2 -->|gRPC| SVC
    A3 -->|HTTP| SVC
    SVC --> GW1 & GW2
    GW1 -->|scrape| A4
    GW2 -->|scrape| A4
    CM -.->|volume mount| GW1 & GW2
    GW1 & GW2 -->|HTTPS| EN
    EN --> MI & LO & TE
```

## Gateway Config (Production Helm Template)

Based on `charts/edge-xscaler/templates/otel-collector-configmap.yaml`:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

  prometheus:
    config:
      scrape_configs:
        - job_name: mimir-distributor
          dns_sd_configs:
            - names:
                - "AAAA+mimir-distributor.xscaler-edge.svc.cluster.local"
              type: AAAA
              port: 8080
          metric_relabel_configs:
            - source_labels: [__name__]
              action: keep
              regex: "xscalor_ext_authz_.*|xscalor_proxy_auth_.*"

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128
  batch:
    timeout: 5s
    send_batch_size: 2048
  attributes/cluster:
    actions:
      - key: xscaler_cluster
        value: "{{ .Release.Namespace }}"
        action: upsert

exporters:
  prometheusremotewrite:
    endpoint: "{{ .Values.otelCollector.remoteWrite.endpoint }}"
    headers:
      X-Scope-OrgID: system-monitoring

service:
  pipelines:
    metrics:
      receivers: [otlp, prometheus]
      processors: [memory_limiter, batch, attributes/cluster]
      exporters: [prometheusremotewrite]
```

## Comparison: Agent Mode vs Gateway Mode

| Feature | Agent Mode | Gateway Mode |
|---|---|---|
| Deployment | DaemonSet (one per node) | Deployment (N replicas) |
| Config mgmt | OpAMP push from portal | ConfigMap + Helm |
| Host metrics | ✅ Native (hostmetrics receiver) | ❌ Requires separate DaemonSet |
| Log files | ✅ Native (filelog receiver) | ❌ |
| Kubernetes scrape | ✅ Per-node k8s SD | ✅ Cluster-wide |
| Central aggregation | ❌ | ✅ |
| Config rollback | Portal revision history | Git revert + kubectl |
| Secret management | KMS via agent-api | Kubernetes Secrets |

---

*← Previous: [Agent Mode](agent-mode.md)*  
*Next: [Lab 01 — Tenant Creation →](../labs/lab-01-tenant-creation.md)*
