# Collector Configurations Reference

## A.1 Minimal Agent Mode Config

Minimal config for sending all three signals to xScaler:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 256
    spike_limit_mib: 64
  batch:
    timeout: 5s
    send_batch_size: 1024

exporters:
  prometheusremotewrite:
    endpoint: https://euw1-01.m.xscalerlabs.com/api/v1/push
    headers:
      Authorization: Bearer ${env:API_KEY}
      X-Scope-OrgID: ${env:TENANT_ID}
  otlphttp/traces:
    endpoint: https://euw1-01.t.xscalerlabs.com
    headers:
      Authorization: Bearer ${env:API_KEY}
      X-Scope-OrgID: ${env:TENANT_ID}
  otlphttp/logs:
    endpoint: https://euw1-01.l.xscalerlabs.com/otlp
    headers:
      Authorization: Bearer ${env:API_KEY}
      X-Scope-OrgID: ${env:TENANT_ID}

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheusremotewrite]
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/traces]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/logs]
```

## A.2 Full Production Agent Config

Production-ready config with host metrics, resource detection, and retry queues:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
  hostmetrics:
    collection_interval: 30s
    scrapers:
      cpu: {}
      disk: {}
      load: {}
      filesystem: {}
      memory: {}
      network: {}

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 256
    spike_limit_mib: 64
  batch:
    timeout: 5s
    send_batch_size: 1024
  resourcedetection:
    detectors: [env, k8snode, system]
    override: false
  attributes:
    actions:
      - key: deployment.environment
        value: ${env:ENVIRONMENT}
        action: upsert
      - key: user_id
        action: delete
      - key: request_id
        action: delete

exporters:
  prometheusremotewrite:
    endpoint: https://euw1-01.m.xscalerlabs.com/api/v1/push
    headers:
      Authorization: Bearer ${env:API_KEY}
      X-Scope-OrgID: ${env:TENANT_ID}
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 30s
      max_elapsed_time: 300s
    queue:
      enabled: true
      num_consumers: 10
      queue_size: 5000
  otlphttp/traces:
    endpoint: https://euw1-01.t.xscalerlabs.com
    headers:
      Authorization: Bearer ${env:API_KEY}
      X-Scope-OrgID: ${env:TENANT_ID}
    retry_on_failure:
      enabled: true
      max_elapsed_time: 120s
  otlphttp/logs:
    endpoint: https://euw1-01.l.xscalerlabs.com/otlp
    headers:
      Authorization: Bearer ${env:API_KEY}
      X-Scope-OrgID: ${env:TENANT_ID}
    retry_on_failure:
      enabled: true
      max_elapsed_time: 120s

service:
  pipelines:
    metrics:
      receivers: [otlp, hostmetrics]
      processors: [memory_limiter, batch, resourcedetection, attributes]
      exporters: [prometheusremotewrite]
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch, resourcedetection]
      exporters: [otlphttp/traces]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch, resourcedetection]
      exporters: [otlphttp/logs]
```

## A.3 OpAMP Supervisor Config

```yaml
# supervisor.yaml (from )
server:
  endpoint: wss://agents.xscalerlabs.com/v1/opamp
  # Local dev:
  # endpoint: ws://agent-api:8082/v1/opamp
  headers:
    Authorization: "Bearer ${env:XSCALER_ENROLLMENT_TOKEN}"

capabilities:
  accepts_remote_config: true
  reports_effective_config: true
  reports_remote_config: true
  reports_health: true

agent:
  executable: /usr/local/bin/otelcol-contrib
  description:
    non_identifying_attributes:
      environment: "${env:ENVIRONMENT}"
      deployment: "${env:DEPLOYMENT}"
      team: "${env:TEAM}"

storage:
  directory: /var/lib/otelcol-supervisor
```

## A.4 Platform OTel Collector (Edge)

Based on `` (local dev):

```yaml
receivers:
  prometheus:
    config:
      scrape_configs:
        - job_name: mimir
          scrape_interval: 15s
          static_configs:
            - targets: ['xMetrics:9009']
              labels: {xscaler_cluster: local}
        - job_name: envoy
          scrape_interval: 15s
          static_configs:
            - targets: ['envoy:9901']
              labels: {xscaler_cluster: local}
        - job_name: proxy-auth
          scrape_interval: 15s
          static_configs:
            - targets: ['proxy-auth:9002']
              labels: {xscaler_cluster: local}
        - job_name: loki
          scrape_interval: 15s
          static_configs:
            - targets: ['xLogs:3100']
              labels: {xscaler_cluster: local}
        - job_name: tempo
          scrape_interval: 15s
          static_configs:
            - targets: ['tempo:3200']
              labels: {xscaler_cluster: local}

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 256
    spike_limit_mib: 64
  batch:
    timeout: 5s
    send_batch_size: 1024

exporters:
  prometheusremotewrite:
    endpoint: http://platform-metrics:9009/api/v1/push
    headers:
      X-Scope-OrgID: <your-tenant-id>

service:
  pipelines:
    metrics:
      receivers: [prometheus]
      processors: [memory_limiter, batch]
      exporters: [prometheusremotewrite]
```

---

*← Previous: [Lab 06](../labs/lab-06-alerting.md)*  
*Next: [OpAMP Deployment →](ansible-playbooks.md)*
