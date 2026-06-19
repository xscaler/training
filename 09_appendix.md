# xScaler Observability Platform
# Appendix — Reference Configurations and Examples

---

## Appendix A: OTel Collector Configurations

### A.1 Minimal Agent Mode (Direct OTLP Push)

Send OTLP telemetry directly to xScaler edge from a collector running beside your application.

```yaml
# otel-collector-agent.yaml
# Deploy as a sidecar container or single-node companion process
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
  resourcedetection:
    detectors: [env, system]
    override: false

exporters:
  otlphttp/traces:
    endpoint: https://euw1-01.t.xscalerlabs.com
    headers:
      Authorization: Bearer ${env:XSCALER_API_KEY}
      X-Scope-OrgID: ${env:XSCALER_TENANT_ID}
    retry_on_failure:
      enabled: true
      max_elapsed_time: 300s

  prometheusremotewrite/metrics:
    endpoint: https://euw1-01.m.xscalerlabs.com/api/v1/push
    headers:
      Authorization: Bearer ${env:XSCALER_API_KEY}
      X-Scope-OrgID: ${env:XSCALER_TENANT_ID}
    tls:
      insecure_skip_verify: false

  otlphttp/logs:
    endpoint: https://euw1-01.l.xscalerlabs.com/otlp
    headers:
      Authorization: Bearer ${env:XSCALER_API_KEY}
      X-Scope-OrgID: ${env:XSCALER_TENANT_ID}

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch, resourcedetection]
      exporters: [otlphttp/traces]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch, resourcedetection]
      exporters: [prometheusremotewrite/metrics]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch, resourcedetection]
      exporters: [otlphttp/logs]
```

### A.2 Gateway Mode (Centralised Collector)

One collector per cluster receives from all pods via OTLP, scrapes Prometheus endpoints, and forwards to xScaler.

```yaml
# otel-collector-gateway.yaml
# Deploy as a Deployment (not DaemonSet) — single pod per cluster
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

  # Pull-mode: Prometheus scraping of all pods
  prometheus:
    config:
      scrape_configs:
        - job_name: kubernetes-pods
          scrape_interval: 30s
          kubernetes_sd_configs:
            - role: pod
          relabel_configs:
            # Only scrape pods with annotation
            - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
              action: keep
              regex: "true"
            # Use annotated port
            - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_port]
              action: replace
              target_label: __address__
              regex: (.+)
              replacement: ${1}
            # Use annotated path
            - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
              action: replace
              target_label: __metrics_path__
              regex: (.+)
            # Add k8s labels as metric labels
            - source_labels: [__meta_kubernetes_namespace]
              target_label: kubernetes_namespace
            - source_labels: [__meta_kubernetes_pod_name]
              target_label: kubernetes_pod_name
            - source_labels: [__meta_kubernetes_pod_label_app]
              target_label: app

        - job_name: kubernetes-nodes
          scrape_interval: 60s
          kubernetes_sd_configs:
            - role: node
          relabel_configs:
            - action: labelmap
              regex: __meta_kubernetes_node_label_(.+)
            - target_label: __address__
              replacement: kubernetes.default.svc:443
            - source_labels: [__meta_kubernetes_node_name]
              regex: (.+)
              target_label: __metrics_path__
              replacement: /api/v1/nodes/${1}/proxy/metrics

  # Kubernetes cluster-level metrics (requires ClusterRole)
  k8s_cluster:
    collection_interval: 30s
    node_conditions_to_report: [Ready, MemoryPressure, DiskPressure]
    allocatable_types_to_report: [cpu, memory, storage]

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128

  batch:
    timeout: 5s
    send_batch_size: 2048

  resourcedetection:
    detectors: [env, k8snode, k8s_cluster]
    override: false

  # Add cluster identifier to all telemetry
  attributes/cluster:
    actions:
      - key: k8s.cluster.name
        value: ${env:CLUSTER_NAME}
        action: upsert
      - key: deployment.environment
        value: ${env:ENVIRONMENT}
        action: upsert

  # Remove high-cardinality labels from metrics
  attributes/metrics:
    actions:
      - key: pod_ip
        action: delete
      - key: container_id
        action: delete

exporters:
  prometheusremotewrite/metrics:
    endpoint: https://euw1-01.m.xscalerlabs.com/api/v1/push
    headers:
      Authorization: Bearer ${env:XSCALER_API_KEY}
      X-Scope-OrgID: ${env:XSCALER_TENANT_ID}
    queue:
      enabled: true
      num_consumers: 10
      queue_size: 10000
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 30s
      max_elapsed_time: 300s

  otlphttp/traces:
    endpoint: https://euw1-01.t.xscalerlabs.com
    headers:
      Authorization: Bearer ${env:XSCALER_API_KEY}
      X-Scope-OrgID: ${env:XSCALER_TENANT_ID}

  otlphttp/logs:
    endpoint: https://euw1-01.l.xscalerlabs.com/otlp
    headers:
      Authorization: Bearer ${env:XSCALER_API_KEY}
      X-Scope-OrgID: ${env:XSCALER_TENANT_ID}

service:
  pipelines:
    metrics:
      receivers: [otlp, prometheus, k8s_cluster]
      processors: [memory_limiter, batch, resourcedetection, attributes/cluster, attributes/metrics]
      exporters: [prometheusremotewrite/metrics]
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch, resourcedetection, attributes/cluster]
      exporters: [otlphttp/traces]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch, resourcedetection, attributes/cluster]
      exporters: [otlphttp/logs]
```

### A.3 OTel Collector — Local Development (Docker Compose)

Based on `/deploy/otel/otel-collector.yaml` in the xScaler repository:

```yaml
# Used in docker-compose stack for local development
receivers:
  prometheus:
    config:
      scrape_configs:
        - job_name: mimir
          scrape_interval: 15s
          static_configs:
            - targets: ['client-mimir:9009']
              labels:
                xscaler_cluster: local

        - job_name: envoy
          scrape_interval: 15s
          static_configs:
            - targets: ['envoy:9901']
              labels:
                xscaler_cluster: local

        - job_name: proxy-auth
          scrape_interval: 15s
          static_configs:
            - targets: ['proxy-auth:9002']
              labels:
                xscaler_cluster: local

        - job_name: loki
          scrape_interval: 15s
          static_configs:
            - targets: ['client-loki:3100']
              labels:
                xscaler_cluster: local

        - job_name: tempo
          scrape_interval: 15s
          static_configs:
            - targets: ['tempo:3200']
              labels:
                xscaler_cluster: local

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
    endpoint: http://system-mimir:9009/api/v1/push
    headers:
      X-Scope-OrgID: system-monitoring

  otlphttp/tempo:
    endpoint: http://tempo:4318
    headers:
      X-Scope-OrgID: system-monitoring

service:
  pipelines:
    metrics:
      receivers: [prometheus]
      processors: [memory_limiter, batch]
      exporters: [prometheusremotewrite]
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/tempo]
```

### A.4 OpAMP Supervisor Configuration

Based on `/deploy/agents/agent-1.supervisor.yaml` in the xScaler repository:

```yaml
# otelcol-supervisor.yaml
# Used with: otelcol-contrib --config supervisor.yaml
server:
  endpoint: wss://agents.xscalerlabs.com/v1/opamp
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
      host.name: "${env:HOSTNAME}"
      # These labels are used by xScaler to assign config templates
      environment: "${env:ENVIRONMENT}"
      team: "${env:TEAM}"
      service: "${env:SERVICE}"

storage:
  directory: /var/lib/otelcol-supervisor

# Local dev version (from repository)
# server:
#   endpoint: ws://agent-api:8082/v1/opamp
#   headers:
#     Authorization: "Bearer xse_localdev0000000000000000000000"
```

### A.5 Config Template Example (Managed via Portal)

This YAML is stored as a template in the xScaler portal and delivered to agents via OpAMP:

```yaml
# Template: "Production Kubernetes Agent"
# Stored in: agent_config_templates / agent_config_template_revisions
# Secrets resolved by KMS at delivery time
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
      cpu:
      disk:
      load:
      filesystem:
      memory:
      network:
      process:
        include:
          names: ['.*']
          match_type: regexp

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

exporters:
  prometheusremotewrite:
    endpoint: ${secret:metrics_endpoint}
    headers:
      Authorization: Bearer ${secret:api_key}
      X-Scope-OrgID: ${secret:tenant_id}

  otlphttp/traces:
    endpoint: ${secret:traces_endpoint}
    headers:
      Authorization: Bearer ${secret:api_key}
      X-Scope-OrgID: ${secret:tenant_id}

  otlphttp/logs:
    endpoint: ${secret:logs_endpoint}
    headers:
      Authorization: Bearer ${secret:api_key}
      X-Scope-OrgID: ${secret:tenant_id}

service:
  pipelines:
    metrics:
      receivers: [otlp, hostmetrics]
      processors: [memory_limiter, batch, resourcedetection]
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

---

## Appendix B: Kubernetes Deployment Manifests

### B.1 OTel Collector DaemonSet (Agent Mode)

```yaml
# daemonset.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: otel-collector-agent
  namespace: monitoring
  labels:
    app: otel-collector-agent
spec:
  selector:
    matchLabels:
      app: otel-collector-agent
  template:
    metadata:
      labels:
        app: otel-collector-agent
    spec:
      serviceAccountName: otel-collector
      containers:
        - name: otel-collector
          image: otel/opentelemetry-collector-contrib:0.104.0
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi
          args:
            - --config=/etc/otelcol/config.yaml
          env:
            - name: XSCALER_API_KEY
              valueFrom:
                secretKeyRef:
                  name: xscaler-credentials
                  key: api_key
            - name: XSCALER_TENANT_ID
              valueFrom:
                secretKeyRef:
                  name: xscaler-credentials
                  key: tenant_id
            - name: CLUSTER_NAME
              value: "prod-k8s-euw1"
            - name: ENVIRONMENT
              value: "production"
            - name: NODE_NAME
              valueFrom:
                fieldRef:
                  fieldPath: spec.nodeName
          volumeMounts:
            - name: config
              mountPath: /etc/otelcol
            - name: hostfs
              mountPath: /hostfs
              readOnly: true
          ports:
            - containerPort: 4317
              protocol: TCP
              name: otlp-grpc
            - containerPort: 4318
              protocol: TCP
              name: otlp-http
      volumes:
        - name: config
          configMap:
            name: otel-collector-config
        - name: hostfs
          hostPath:
            path: /
      tolerations:
        - key: node-role.kubernetes.io/master
          effect: NoSchedule
      hostNetwork: false
      hostPID: false
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: otel-collector
  namespace: monitoring
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: otel-collector
rules:
  - apiGroups: [""]
    resources: [nodes, nodes/proxy, nodes/metrics, services, endpoints, pods]
    verbs: [get, list, watch]
  - apiGroups: [extensions, networking.k8s.io]
    resources: [ingresses]
    verbs: [get, list, watch]
  - nonResourceURLs: [/metrics, /metrics/cadvisor]
    verbs: [get]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: otel-collector
subjects:
  - kind: ServiceAccount
    name: otel-collector
    namespace: monitoring
roleRef:
  kind: ClusterRole
  name: otel-collector
  apiGroup: rbac.authorization.k8s.io
```

### B.2 OpAMP Agent Deployment (DaemonSet with Supervisor)

```yaml
# daemonset-opamp.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: otelcol-supervisor
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: otelcol-supervisor
  template:
    metadata:
      labels:
        app: otelcol-supervisor
    spec:
      containers:
        - name: supervisor
          image: ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib:0.104.0
          command: ["otelcol-contrib", "--config=/etc/supervisor/supervisor.yaml"]
          env:
            - name: XSCALER_ENROLLMENT_TOKEN
              valueFrom:
                secretKeyRef:
                  name: xscaler-enrollment
                  key: token
            - name: HOSTNAME
              valueFrom:
                fieldRef:
                  fieldPath: spec.nodeName
            - name: ENVIRONMENT
              value: "production"
            - name: TEAM
              value: "platform"
          volumeMounts:
            - name: supervisor-config
              mountPath: /etc/supervisor
            - name: supervisor-storage
              mountPath: /var/lib/otelcol-supervisor
      volumes:
        - name: supervisor-config
          configMap:
            name: otelcol-supervisor-config
        - name: supervisor-storage
          emptyDir: {}
---
apiVersion: v1
kind: Secret
metadata:
  name: xscaler-enrollment
  namespace: monitoring
type: Opaque
stringData:
  token: "xse_your_enrollment_token_here"
---
apiVersion: v1
kind: Secret
metadata:
  name: xscaler-credentials
  namespace: monitoring
type: Opaque
stringData:
  api_key: "xag_your_api_key_here"
  tenant_id: "xs_acme_prod"
```

### B.3 Gateway Mode Deployment

```yaml
# deployment-gateway.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: otel-collector-gateway
  namespace: monitoring
spec:
  replicas: 2
  selector:
    matchLabels:
      app: otel-collector-gateway
  template:
    metadata:
      labels:
        app: otel-collector-gateway
    spec:
      containers:
        - name: otel-collector
          image: otel/opentelemetry-collector-contrib:0.104.0
          args: ["--config=/etc/otelcol/config.yaml"]
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: 2
              memory: 1Gi
          env:
            - name: XSCALER_API_KEY
              valueFrom:
                secretKeyRef:
                  name: xscaler-credentials
                  key: api_key
            - name: XSCALER_TENANT_ID
              valueFrom:
                secretKeyRef:
                  name: xscaler-credentials
                  key: tenant_id
            - name: CLUSTER_NAME
              value: "prod-k8s-euw1"
            - name: ENVIRONMENT
              value: "production"
          volumeMounts:
            - name: config
              mountPath: /etc/otelcol
          ports:
            - containerPort: 4317
              name: otlp-grpc
            - containerPort: 4318
              name: otlp-http
      volumes:
        - name: config
          configMap:
            name: otel-collector-gateway-config
---
apiVersion: v1
kind: Service
metadata:
  name: otel-collector-gateway
  namespace: monitoring
spec:
  selector:
    app: otel-collector-gateway
  ports:
    - name: otlp-grpc
      port: 4317
      targetPort: 4317
    - name: otlp-http
      port: 4318
      targetPort: 4318
  type: ClusterIP
```

---

## Appendix C: Portal API Reference

### C.1 Authentication

**Login (exchange Cognito token for xScaler JWT):**
```bash
curl -s -X POST "$PORTAL_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "cognito_token": "eyJhbGciOiJSUzI1Ni..."
  }' | jq .
# Returns: {"token": "eyJhbGciOiJIUzI1...", "expires_in": 1800}
# Token stored as HttpOnly cookie by browser; pass as Bearer for API calls
export JWT_TOKEN="eyJhbGciOiJIUzI1..."
```

**Sign up (local dev / API-first):**
```bash
curl -s -X POST "$PORTAL_BASE/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "SecurePassword123!",
    "name": "Platform Admin"
  }' | jq .
```

### C.2 Organisation Management

**Get current organisation:**
```bash
curl -s "$PORTAL_BASE/org" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .
```

**Update organisation settings:**
```bash
curl -s -X PATCH "$PORTAL_BASE/org" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"display_name": "Acme Corp Production"}' | jq .
```

### C.3 Tenant Management

**List all tenants:**
```bash
curl -s "$PORTAL_BASE/tenants" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .
# Returns array of tenant objects with id, display_name, slug, status
```

**Create a tenant:**
```bash
curl -s -X POST "$PORTAL_BASE/tenants" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Payment Service Production",
    "environment": "prod"
  }' | jq .
# Returns: {"id": "xs_payment_abc12345", "display_name": "...", ...}
export TENANT_ID="xs_payment_abc12345"
```

**Get tenant details:**
```bash
curl -s "$PORTAL_BASE/tenants/$TENANT_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .
```

**Delete a tenant:**
```bash
curl -s -X DELETE "$PORTAL_BASE/tenants/$TENANT_ID" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### C.4 API Key Management

**Create an API key:**
```bash
curl -s -X POST "$PORTAL_BASE/tenants/$TENANT_ID/keys" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"display_name": "k8s-prod-daemonset"}' | jq .
# Returns: {"id": "...", "key": "xag_...", "display_name": "..."}
# IMPORTANT: key value is only shown once — save it immediately
export API_KEY="xag_..."
```

**List API keys for a tenant:**
```bash
curl -s "$PORTAL_BASE/tenants/$TENANT_ID/keys" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .
# Keys are shown with prefix only — full value not stored
```

**Revoke an API key:**
```bash
curl -s -X DELETE "$PORTAL_BASE/tenants/$TENANT_ID/keys/$KEY_ID" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### C.5 Team Member Management

**Invite a team member:**
```bash
curl -s -X POST "$PORTAL_BASE/org/members/invite" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "colleague@example.com",
    "role": "member"
  }' | jq .
# Roles: owner, admin, member, viewer
```

**List members:**
```bash
curl -s "$PORTAL_BASE/org/members" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .
```

**Remove a member:**
```bash
curl -s -X DELETE "$PORTAL_BASE/org/members/$MEMBER_ID" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### C.6 Dashboard API

**Get organisation summary (billing + usage):**
```bash
curl -s "$PORTAL_BASE/dashboard/org/summary" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '{
    plan: .billing_plan,
    active_series: .org_active_series,
    plan_max_series: .plan_max_active_series,
    logs_gb: .org_logs_gb_ingested_this_month
  }'
```

**Get tenant usage:**
```bash
curl -s "$PORTAL_BASE/dashboard/tenants/$TENANT_ID/usage" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .
```

---

## Appendix D: Data Plane API Reference

### D.1 Metrics (Mimir via Envoy :8080)

**Push metrics (Prometheus remote write):**
```bash
# Using curl with protobuf-encoded body (production)
# In practice, use an OTel collector or Prometheus remote_write config

# Push using otelcol-contrib (easier for testing)
cat > /tmp/test-metric.json << 'EOF'
{
  "resourceMetrics": [{
    "resource": {
      "attributes": [{
        "key": "service.name",
        "value": {"stringValue": "test-service"}
      }]
    },
    "scopeMetrics": [{
      "metrics": [{
        "name": "test_counter_total",
        "sum": {
          "dataPoints": [{
            "asDouble": 42,
            "timeUnixNano": "1700000000000000000"
          }],
          "isMonotonic": true
        }
      }]
    }]
  }]
}
EOF

curl -s -X POST "https://euw1-01.m.xscalerlabs.com/otlp/v1/metrics" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d @/tmp/test-metric.json
```

**Query metrics (PromQL):**
```bash
# Instant query
curl -s "https://euw1-01.m.xscalerlabs.com/prometheus/api/v1/query" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  --data-urlencode 'query=up' | jq .

# Range query
curl -s "https://euw1-01.m.xscalerlabs.com/prometheus/api/v1/query_range" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  --data-urlencode 'query=rate(http_requests_total[5m])' \
  --data-urlencode "start=$(date -v-1H +%s)" \
  --data-urlencode "end=$(date +%s)" \
  --data-urlencode 'step=60' | jq .

# List label values
curl -s "https://euw1-01.m.xscalerlabs.com/prometheus/api/v1/label/__name__/values" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" | jq '.data | length'
```

### D.2 Logs (Loki via Envoy :8181)

**Push logs (JSON):**
```bash
curl -s -X POST "https://euw1-01.l.xscalerlabs.com/loki/api/v1/push" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "streams": [{
      "stream": {
        "service": "payment-api",
        "environment": "production",
        "level": "error"
      },
      "values": [
        ["'"$(date +%s%N)"'", "Payment processing failed: timeout after 30s"]
      ]
    }]
  }'
```

**Query logs (LogQL):**
```bash
# Instant log query
curl -s "https://euw1-01.l.xscalerlabs.com/loki/api/v1/query" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  --data-urlencode 'query={service="payment-api"}' \
  --data-urlencode 'limit=100' | jq .

# Range query
curl -s "https://euw1-01.l.xscalerlabs.com/loki/api/v1/query_range" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  --data-urlencode 'query={service="payment-api"} |= "error"' \
  --data-urlencode "start=$(date -v-1H +%s)000000000" \
  --data-urlencode "end=$(date +%s)000000000" \
  --data-urlencode 'limit=50' | jq '.data.result[].values'

# Log metric query (count over time)
curl -s "https://euw1-01.l.xscalerlabs.com/loki/api/v1/query_range" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  --data-urlencode 'query=rate({service="payment-api", level="error"}[5m])' \
  --data-urlencode "start=$(date -v-1H +%s)000000000" \
  --data-urlencode "end=$(date +%s)000000000" \
  --data-urlencode 'step=60s' | jq .
```

### D.3 Traces (Tempo via Envoy :8282 HTTP / :4317 gRPC)

**Push traces via OTLP HTTP:**
```bash
curl -s -X POST "https://euw1-01.t.xscalerlabs.com/v1/traces" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [{
          "key": "service.name",
          "value": {"stringValue": "payment-api"}
        }]
      },
      "scopeSpans": [{
        "spans": [{
          "traceId": "0102030405060708090a0b0c0d0e0f10",
          "spanId": "0102030405060708",
          "name": "ProcessPayment",
          "kind": 2,
          "startTimeUnixNano": "'"$(date +%s)"'000000000",
          "endTimeUnixNano": "'"$(($(date +%s) + 1))"'000000000",
          "status": {"code": 1}
        }]
      }]
    }]
  }'
```

**Query trace by ID:**
```bash
# Query via Tempo API (requires Grafana datasource or direct Tempo API)
TRACE_ID="0102030405060708090a0b0c0d0e0f10"
curl -s "https://euw1-01.t.xscalerlabs.com/api/traces/$TRACE_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Scope-OrgID: $TENANT_ID" | jq .
```

---

## Appendix E: Grafana Datasource Provisioning

### E.1 Complete Datasource YAML

Based on `/deploy/observability/grafana/provisioning/datasources/datasource.yml`:

```yaml
# grafana/provisioning/datasources/xscaler-datasources.yaml
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
    secureJsonData:
      httpHeaderName1: Authorization
      httpHeaderValue1: Bearer xag_your_api_key_here
      httpHeaderName2: X-Scope-OrgID
      httpHeaderValue2: xs_your_tenant_id

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
      httpHeaderValue1: Bearer xag_your_api_key_here
      httpHeaderName2: X-Scope-OrgID
      httpHeaderValue2: xs_your_tenant_id

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
            query: sum(rate(http_errors_total{$__tags}[5m]))
      serviceMap:
        datasourceUid: xscaler-metrics
      nodeGraph:
        enabled: true
    secureJsonData:
      httpHeaderName1: Authorization
      httpHeaderValue1: Bearer xag_your_api_key_here
      httpHeaderName2: X-Scope-OrgID
      httpHeaderValue2: xs_your_tenant_id
```

### E.2 Kubernetes Secret for Grafana Datasource

```yaml
# For Grafana Helm chart — secrets mounted as provisioning files
apiVersion: v1
kind: Secret
metadata:
  name: grafana-datasources
  namespace: monitoring
stringData:
  datasources.yaml: |
    apiVersion: 1
    datasources:
      - name: xScaler Metrics
        type: prometheus
        url: https://euw1-01.m.xscalerlabs.com/prometheus
        secureJsonData:
          httpHeaderName1: Authorization
          httpHeaderValue1: Bearer $(XSCALER_API_KEY)
          httpHeaderName2: X-Scope-OrgID
          httpHeaderValue2: $(XSCALER_TENANT_ID)
```

---

## Appendix F: Helm Chart Deployment Reference

### F.1 Portal Stack (Control Plane)

```bash
# Deploy portal stack (portal-api, portal-web, agent-api)
helm repo add xscaler https://charts.xscalerlabs.com
helm repo update

helm install portal-xscaler xscaler/portal-xscaler \
  --namespace xscaler-system \
  --create-namespace \
  --version 1.2.3 \
  --values portal-values.yaml

# portal-values.yaml (excerpt from charts/portal-xscaler/values.yaml)
```

**Key values for `portal-values.yaml`:**
```yaml
# ECR image references (actual from charts/portal-xscaler/values.yaml)
portalApi:
  image:
    repository: 483075907540.dkr.ecr.eu-west-1.amazonaws.com/xscaler/portal-api
    tag: "1.2.3"
  port: 8081

portalWeb:
  image:
    repository: 483075907540.dkr.ecr.eu-west-1.amazonaws.com/xscaler/portal-web
    tag: "1.2.3"

agentApi:
  image:
    repository: 483075907540.dkr.ecr.eu-west-1.amazonaws.com/xscaler/agent-api
    tag: "1.2.3"
  port: 8082
  opampPath: /v1/opamp
  staleAfter: 90s

database:
  host: postgres.xscaler-system.svc.cluster.local
  port: 5432
  name: xscaler

aws:
  region: eu-west-1
  kmsKeyAlias:
    grafana: alias/xscaler-grafana-secrets
    agentConfig: alias/xscaler-agent-config-secrets

billing:
  stripe:
    secretKeyRef: stripe-credentials
  plans:
    free:
      name: Free
      price: 0
    scale:
      name: Scale
      price: 19
    enterprise:
      name: Enterprise
      price: custom

# CronJob schedules
cronJobs:
  usageReporter:
    schedule: "15 2 * * *"
  grafanaUsageReporter:
    schedule: "*/15 * * * *"
  customerReconciler:
    schedule: "*/10 * * * *"
```

### F.2 Edge Stack (Data Plane)

```bash
# Deploy edge data plane (Envoy, proxy-auth, Mimir, Loki, Tempo)
helm install edge-xscaler xscaler/edge-xscaler \
  --namespace xscaler-edge \
  --create-namespace \
  --version 1.2.3 \
  --values edge-values.yaml
```

**Key values for `edge-values.yaml`:**
```yaml
cluster:
  name: euw1-01
  region: eu-west-1

envoy:
  listeners:
    metrics: 8080
    logs: 8181
    tracesHttp: 8282
    tracesGrpc: 4317

mimir:
  multitenancyEnabled: true
  storage:
    backend: s3
    s3:
      bucket: xscaler-mimir-euw1-01
      region: eu-west-1

loki:
  authEnabled: true
  storage:
    type: s3
    s3:
      bucketnames: xscaler-loki-euw1-01
      region: eu-west-1

tempo:
  multitenancyEnabled: true
  storage:
    trace:
      backend: s3
      s3:
        bucket: xscaler-tempo-euw1-01
        region: eu-west-1

otelCollector:
  remoteWrite:
    endpoint: http://system-mimir:9009/api/v1/push
  clusterLabel: euw1-01
```

### F.3 ArgoCD Application (GitOps)

From `/gitops/apps/edge-euw1-01/`:

```yaml
# apps/edge-euw1-01/edge-xscaler.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: edge-xscaler
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/xscaler/gitops
    targetRevision: HEAD
    path: charts/edge-xscaler
    helm:
      valueFiles:
        - ../../values/prod/edge-euw1-01/edge-xscaler.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: xscaler-edge
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

---

## Appendix G: Docker Compose Reference (Local Development)

Based on the Docker Compose stack in the xScaler repository root:

### G.1 Key Services and Ports

| Service | Port(s) | Purpose |
|---|---|---|
| `portal-api` | 8081 | Control plane API |
| `portal-web` | 3000 | Portal UI |
| `agent-api` | 8082 | OpAMP server |
| `envoy` | 8080/8181/8282/4317 | Data plane gateway |
| `proxy-auth` | 9002 (metrics) | Auth + metrics |
| `proxy-auth-logs` | 9002 (metrics) | Auth + logs |
| `proxy-auth-traces` | 9002 (metrics) | Auth + traces |
| `client-mimir` | 9009 | Mimir (tenant data) |
| `system-mimir` | 9010 | Mimir (platform metrics) |
| `client-loki` | 3100 | Loki (tenant logs) |
| `client-tempo` | 3200/4317/4318 | Tempo (tenant traces) |
| `grafana` | 3001 | Grafana UI |
| `postgres` | 5432 | PostgreSQL |
| `otel-collector` | 4317/4318 | Platform OTel collector |
| `agent-1` | — | Local dev OpAMP agent |

### G.2 Start the Full Stack

```bash
# Clone the repository
git clone https://github.com/xscaler/xscaler.git
cd xscaler

# Configure environment
cp .env.example .env
# Edit .env: set STRIPE_SECRET_KEY, COGNITO_*, etc.

# Start all services
docker compose up -d

# Check health
docker compose ps
docker compose logs -f portal-api

# Seed local dev data (enrollment token + config template)
docker compose exec postgres psql -U xscaler -d xscaler \
  -f /scripts/agents/seed-local.sql

# Verify all services are up
curl -s http://localhost:8081/health
curl -s http://localhost:8082/health
```

### G.3 Local Dev Endpoints

```bash
# Portal API
export PORTAL_BASE="http://localhost:8081"

# Data plane (via Envoy)
export METRICS_BASE="http://localhost:8080"
export LOGS_BASE="http://localhost:8181"
export TRACES_HTTP_BASE="http://localhost:8282"
export TRACES_GRPC_BASE="http://localhost:4317"

# AgentAPI (OpAMP)
export AGENT_BASE="http://localhost:8082"

# Grafana
open http://localhost:3001

# Local dev enrollment token (from seed-local.sql)
export ENROLLMENT_TOKEN="xse_localdev0000000000000000000000"
```

---

## Appendix H: Database Schema Reference

### H.1 portal-api Owned Tables

```sql
-- Core identity
CREATE TABLE organizations (
  id          TEXT PRIMARY KEY,  -- xs_org_<32-lower-hex>
  slug        TEXT UNIQUE NOT NULL,
  public_id   TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tenants (
  id              TEXT PRIMARY KEY,  -- xs_<slug>_<8-char-lower-base32>
  organization_id TEXT REFERENCES organizations(id),
  display_name    TEXT NOT NULL,
  environment     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE api_keys (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT REFERENCES tenants(id),
  organization_id TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  key_hash        TEXT NOT NULL,  -- SHA-256 of xag_... value
  prefix          TEXT NOT NULL,  -- First 8 chars for display
  created_at      TIMESTAMPTZ DEFAULT now(),
  revoked_at      TIMESTAMPTZ
);
```

### H.2 agent-api Owned Tables

```sql
-- Enrollment tokens (xse_ prefix)
CREATE TABLE agent_enrollment_tokens (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  token_hash      TEXT NOT NULL,  -- SHA-256 of xse_... value
  max_uses        INTEGER,
  use_count       INTEGER DEFAULT 0,
  default_labels  JSONB DEFAULT '{}',
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Registered agents
CREATE TABLE agents (
  id              TEXT PRIMARY KEY,  -- UUID assigned by supervisor
  organization_id TEXT NOT NULL,
  labels          JSONB DEFAULT '{}',  -- Label selector target
  last_seen_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Per-agent API keys (xag_ prefix, created during enrollment)
CREATE TABLE agent_keys (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT REFERENCES agents(id),
  key_hash   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Config templates
CREATE TABLE agent_config_templates (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Versioned template content
CREATE TABLE agent_config_template_revisions (
  id          TEXT PRIMARY KEY,
  template_id TEXT REFERENCES agent_config_templates(id),
  revision    INTEGER NOT NULL,
  config_yaml TEXT NOT NULL,  -- May contain ${secret:NAME} references
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (template_id, revision)
);

-- Label-selector based assignments
CREATE TABLE agent_config_assignments (
  id                  TEXT PRIMARY KEY,
  organization_id     TEXT NOT NULL,
  revision_id         TEXT REFERENCES agent_config_template_revisions(id),
  label_selector      JSONB DEFAULT '{}',  -- {} matches all agents
  priority            INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Config delivery tracking
CREATE TABLE agent_config_deliveries (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT REFERENCES agents(id),
  revision_id TEXT REFERENCES agent_config_template_revisions(id),
  status      TEXT DEFAULT 'offered',  -- offered → applying → applied | failed
  offered_at  TIMESTAMPTZ DEFAULT now(),
  applied_at  TIMESTAMPTZ,
  error       TEXT
);

-- Encrypted secrets (KMS envelope encryption)
CREATE TABLE agent_config_secrets (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name            TEXT NOT NULL,  -- Referenced as ${secret:NAME}
  ciphertext      BYTEA NOT NULL, -- KMS-encrypted value
  kms_key_id      TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, name)
);
```

---

## Appendix I: Key PromQL Queries Reference

### I.1 Platform Self-Monitoring

```promql
# Active series per tenant (requires system-mimir datasource)
sum by (user) (cortex_ingester_active_series)

# Ingestion rate per tenant
sum by (user) (rate(cortex_distributor_received_samples_total[5m]))

# Log ingestion rate per tenant
sum by (tenant) (rate(loki_distributor_bytes_received_total[5m]))

# Traces ingested per tenant
sum by (tenant) (rate(tempo_distributor_bytes_received_total[5m]))

# Envoy request rate by listener
sum by (listener_address) (rate(envoy_http_downstream_rq_total[5m]))

# proxy-auth auth failures (from xscalor_ext_authz_* metrics)
sum by (status) (rate(xscalor_ext_authz_requests_total[5m]))

# Agent online count
count(time() - on(agent_id) group_right() agent_last_seen_timestamp < 90)
```

### I.2 Application Monitoring

```promql
# Request rate (RED method)
sum(rate(http_requests_total{service="$service"}[5m]))

# Error rate
sum(rate(http_requests_total{service="$service", status=~"5.."}[5m]))
/ sum(rate(http_requests_total{service="$service"}[5m]))

# p99 latency
histogram_quantile(0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket{service="$service"}[5m]))
)

# Service map: requests between services
sum by (client, server) (rate(traces_service_graph_request_total[5m]))
```

### I.3 Infrastructure Monitoring

```promql
# Node CPU utilisation
1 - avg by (node) (rate(node_cpu_seconds_total{mode="idle"}[5m]))

# Node memory utilisation
1 - avg by (node) (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)

# Pod restart rate
sum by (pod, namespace) (increase(kube_pod_container_status_restarts_total[1h]))

# PVC usage
kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes
```

---

## Appendix J: Common LogQL Queries Reference

```logql
# All error logs from a service
{service="payment-api", level="error"}

# Count errors over time
rate({service="payment-api"} |= "error" [5m])

# Parse JSON logs and filter
{service="payment-api"}
| json
| status_code >= 500

# Extract HTTP metrics from logs
sum by (method, path) (
  rate({service="api-gateway"}
  | pattern `<method> <path> HTTP/<_> <status>`
  | status >= 500
  [5m])
)

# Find slow database queries
{service="payment-api"}
| json
| duration > 1000
| line_format "{{.duration}}ms - {{.query}}"

# Trace correlation: find logs for a trace
{service="payment-api"} | json | trace_id="abc123def456"
```

---

*End of Appendix — xScaler Observability Platform Training Package*

*All configurations, schema definitions, and code examples are derived from the xScaler repository at the time of this document's creation. Verify against the current codebase for any version-specific differences.*
