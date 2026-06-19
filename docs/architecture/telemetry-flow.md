# End-to-End Telemetry Flow

## Metrics Ingestion Flow

```mermaid
sequenceDiagram
    participant COL as OTel Collector
    participant EN as Envoy :8080
    participant PA as proxy-auth
    participant PG as PostgreSQL
    participant MI as xMetrics :9009
    participant S3 as AWS S3

    COL->>EN: POST /api/v1/push\nAuthorization: Bearer xag_...\nContent-Type: application/x-protobuf\n[Snappy-encoded Prometheus protobufs]

    Note over EN: Lua filter: validate X-Scope-OrgID\n→ reject comma-separated values

    EN->>PA: gRPC CheckRequest {\n  path: /api/v1/push,\n  headers: {Authorization: Bearer xag_...}\n}

    PA->>PA: hash = SHA-256(xag_...)
    PA->>PG: SELECT tenant_id, org_id\nFROM api_keys\nWHERE key_hash = $hash\nAND revoked_at IS NULL

    PA->>PA: Check rate limits\n(max_active_series + scrape interval)

    PA->>EN: OkHttpResponse {\n  headers_to_set: [\n    {X-Scope-OrgID: xs_payment_abc12345}\n  ]\n}

    EN->>MI: POST /api/v1/push\nX-Scope-OrgID: xs_payment_abc12345\n[Snappy-encoded data]

    MI->>MI: Parse timeseries\nWrite WAL
    MI->>MI: Flush to object storage
    MI->>S3: PUT s3://mimir-blocks/xs_payment_abc12345/...

    MI->>EN: 204 No Content
    EN->>COL: 204 No Content
```

## Logs Ingestion Flow

```mermaid
sequenceDiagram
    participant COL as OTel Collector / Promtail
    participant EN as Envoy :8181
    participant PA as proxy-auth-logs
    participant LO as xLogs :3100
    participant S3 as AWS S3

    COL->>EN: POST /loki/api/v1/push\nAuthorization: Bearer xag_...\nContent-Type: application/json

    EN->>PA: gRPC CheckRequest
    PA->>PA: Key validation + rate limit\n(max_logs_bytes_per_sec)
    PA->>EN: OK + X-Scope-OrgID: xs_payment_abc12345

    EN->>LO: POST /loki/api/v1/push\nX-Scope-OrgID: xs_payment_abc12345

    LO->>LO: Parse log streams\nIndex labels (TSDB v13)
    LO->>LO: Chunk compression
    LO->>S3: PUT s3://loki-chunks/xs_payment_abc12345/...

    LO->>EN: 204 No Content
    EN->>COL: 204 No Content
```

## Traces Ingestion Flow

```mermaid
sequenceDiagram
    participant COL as OTel Collector
    participant EN as Envoy :8282/:4317
    participant PA as proxy-auth-traces
    participant TE as xTraces :3200
    participant S3 as AWS S3

    alt HTTP OTLP
        COL->>EN: POST /v1/traces :8282\nContent-Type: application/x-protobuf
    else gRPC OTLP
        COL->>EN: TraceService/Export :4317\n(HTTP2/gRPC)
    end

    EN->>PA: gRPC CheckRequest
    PA->>EN: OK + X-Scope-OrgID: xs_payment_abc12345

    EN->>TE: Forward with X-Scope-OrgID

    TE->>TE: Parse spans\nWrite WAL
    TE->>TE: Build trace blocks
    TE->>S3: PUT s3://tempo-blocks/xs_payment_abc12345/...

    TE->>EN: 200 OK
    EN->>COL: 200 OK
```

## Query Flow (Grafana → xMetrics)

```mermaid
sequenceDiagram
    participant GR as Grafana
    participant EN as Envoy :8080
    participant PA as proxy-auth
    participant MI as xMetrics

    GR->>EN: GET /prometheus/api/v1/query\nAuthorization: Bearer xag_...\nX-Scope-OrgID: xs_payment_abc12345\n?query=rate(http_requests_total[5m])

    EN->>PA: ext_authz CheckRequest
    PA->>EN: OK (tenant confirmed)

    EN->>MI: GET /prometheus/api/v1/query\nX-Scope-OrgID: xs_payment_abc12345\n?query=rate(http_requests_total[5m])

    MI->>MI: Query WAL + blocks for\ntenant xs_payment_abc12345 only

    MI->>EN: JSON response {data: {resultType: "vector", ...}}
    EN->>GR: JSON response
```

---

*← Previous: [Platform Architecture](platform-architecture.md)*  
*Next: [Multi-Tenant Architecture →](multi-tenant.md)*
