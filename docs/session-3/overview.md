# Session 3 — Data Collection Architecture

## Session Overview

**Duration:** 2 hours  
**Format:** Architecture deep-dive + workshop  
**Level:** Intermediate

---

## Session Agenda

| Time | Topic | Format |
|---|---|---|
| 0:00 – 0:30 | Metrics collection: Prometheus scrape vs OTLP push | Presentation |
| 0:30 – 1:00 | Deep-dive: Envoy gateway architecture | Architecture Review |
| 1:00 – 1:30 | Logs and traces pipeline review | Presentation |
| 1:30 – 2:00 | Customer architecture workshop | Group exercise |

---

## Learning Objectives

- [ ] Explain the difference between pull (Prometheus scrape) and push (OTLP) collection
- [ ] Trace a metric from OTel Collector to Mimir through Envoy and proxy-auth
- [ ] Describe how proxy-auth validates API keys and injects X-Scope-OrgID
- [ ] Design a data collection architecture for a sample customer scenario

---

## Session Pages

1. [Metrics Collection](metrics-collection.md) — Prometheus vs OTLP, scrape config, remote_write
2. [Architecture Review](architecture-review.md) — Envoy, ext_authz, proxy-auth deep dive
3. [Customer Workshop](customer-workshop.md) — group design exercise

---

*← Previous: [Agent vs Gateway](../session-2/agent-vs-gateway.md)*  
*Next: [Metrics Collection →](metrics-collection.md)*
