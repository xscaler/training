# OpAMP Agent Deployment Reference

!!! info "No Ansible in xScaler"
    The xScaler repository does not contain Ansible playbooks. Agent configuration is managed via **OpAMP** through `agent-api`, not through configuration management tools like Ansible or Chef.

    This section provides equivalent Kubernetes and systemd deployment patterns.

## Kubernetes DaemonSet — OpAMP Supervisor

```yaml
# k8s/otelcol-supervisor-daemonset.yaml
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
kind: ConfigMap
metadata:
  name: otelcol-supervisor-config
  namespace: monitoring
data:
  supervisor.yaml: |
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
          environment: "${env:ENVIRONMENT}"
          deployment: "kubernetes"
          cluster: "${env:CLUSTER_NAME}"
    storage:
      directory: /var/lib/otelcol-supervisor
---
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
      serviceAccountName: otel-collector
      containers:
        - name: supervisor
          image: otel/opentelemetry-collector-contrib:0.104.0
          command: ["otelcol-contrib", "--config=/etc/supervisor/supervisor.yaml"]
          env:
            - name: XSCALER_ENROLLMENT_TOKEN
              valueFrom:
                secretKeyRef:
                  name: xscaler-enrollment
                  key: token
            - name: ENVIRONMENT
              value: "production"
            - name: CLUSTER_NAME
              value: "prod-k8s-euw1"
            - name: HOSTNAME
              valueFrom:
                fieldRef:
                  fieldPath: spec.nodeName
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi
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
      tolerations:
        - key: node-role.kubernetes.io/master
          effect: NoSchedule
```

## systemd Service — VM Deployment

```ini
# /etc/systemd/system/otelcol-supervisor.service
[Unit]
Description=OpenTelemetry Collector Supervisor (xScaler)
After=network.target

[Service]
Type=simple
User=otelcol
Group=otelcol
EnvironmentFile=/etc/otelcol/environment
ExecStart=/usr/local/bin/otelcol-supervisor \
  --config /etc/otelcol-supervisor/supervisor.yaml
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
# /etc/otelcol/environment
XSCALER_ENROLLMENT_TOKEN=xse_your_enrollment_token
ENVIRONMENT=production
TEAM=platform
```

```bash
# Deploy commands
sudo useradd --system --no-create-home otelcol
sudo mkdir -p /etc/otelcol-supervisor /var/lib/otelcol-supervisor
sudo chown otelcol: /var/lib/otelcol-supervisor
sudo cp supervisor.yaml /etc/otelcol-supervisor/
sudo cp otelcol-contrib /usr/local/bin/
sudo cp environment /etc/otelcol/
sudo systemctl daemon-reload
sudo systemctl enable --now otelcol-supervisor
sudo systemctl status otelcol-supervisor
```

## Docker Compose — Local Testing

```yaml
# docker-compose.otel.yaml
services:
  otelcol-supervisor:
    image: otel/opentelemetry-collector-contrib:0.104.0
    command: ["otelcol-contrib", "--config=/etc/supervisor/supervisor.yaml"]
    environment:
      - XSCALER_ENROLLMENT_TOKEN=${XSCALER_ENROLLMENT_TOKEN}
      - ENVIRONMENT=local
      - HOSTNAME=${HOSTNAME}
    volumes:
      - ./supervisor.yaml:/etc/supervisor/supervisor.yaml:ro
      - supervisor-storage:/var/lib/otelcol-supervisor
    restart: unless-stopped

volumes:
  supervisor-storage:
```

---

*← Previous: [Collector Configurations](collector-configurations.md)*  
*Next: [API Examples →](api-examples.md)*
