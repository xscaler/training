# Session 2 — OpenTelemetry Fundamentals

## Session Overview

**Duration:** 2 hours  
**Format:** Instructor presentation + hands-on exercises  
**Level:** Intermediate

---

## Session Agenda

| Time | Topic | Format |
|---|---|---|
| 0:00 – 0:30 | OpenTelemetry history, goals, and CNCF status | Presentation |
| 0:30 – 1:00 | OTel Collector: components, configuration | Presentation + Demo |
| 1:00 – 1:30 | Deployment models: Agent vs Gateway | Presentation + Architecture |
| 1:30 – 2:00 | Hands-on: configure and run a collector | Lab exercise |

---

## Learning Objectives

By the end of Session 2, you will be able to:

- [ ] Describe OpenTelemetry's role in the CNCF ecosystem
- [ ] Explain the OTel Collector pipeline: receivers → processors → exporters
- [ ] Read and write a basic OTel collector YAML configuration
- [ ] Choose between Agent Mode and Gateway Mode for a given deployment scenario
- [ ] Connect an OTel collector to xScaler

---

## Session Pages

1. [OTel Overview](otel-overview.md) — CNCF, signals, SDK, protocol
2. [Collector Components](collector-components.md) — receivers, processors, exporters, pipelines
3. [Deployment Models](deployment-models.md) — single node, DaemonSet, Deployment
4. [Agent vs Gateway](agent-vs-gateway.md) — mode comparison, selection guide

---

## Key Concepts Introduced

| Concept | Description |
|---|---|
| OTLP | OpenTelemetry Line Protocol — the wire format for all three signals |
| Receiver | Ingest endpoint for a collector (OTLP, Prometheus, Filelog, etc.) |
| Processor | Transforms data in-pipeline (batch, memory_limiter, attributes, etc.) |
| Exporter | Sends data to a backend (prometheusremotewrite, otlphttp, etc.) |
| Pipeline | Connects receivers → processors → exporters for one signal type |
| Agent Mode | One collector per host, co-located with applications |
| Gateway Mode | Centralised collector receiving from many sources |

---

## Instructor Notes

!!! tip "Trainer Guidance"
    - Show the actual OTel collector config from `` in the repository
    - Run `docker compose logs otel-collector` to show live scraping activity
    - Use the Grafana Explore view to show data flowing from OTel Collector into platform-metrics

---

*← Previous: [Observability Fundamentals](../session-1/observability-fundamentals.md)*  
*Next: [OTel Overview →](otel-overview.md)*
