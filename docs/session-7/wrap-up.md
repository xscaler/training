# Training Wrap-Up

## Training Summary

Congratulations on completing the xScaler Observability Platform Training! Over two days, you have covered:

---

## What You Learned

=== "Day 1"

    **Session 1 — Platform Introduction**
    - xScaler two-tier architecture: control plane + edge data plane
    - Component roles: portal-api, agent-api, Envoy, proxy-auth, Mimir, Loki, Tempo
    - Authentication: Cognito → JWT (30-min TTL) for users, SHA-256 API keys for collectors
    - Multi-tenant isolation via `X-Scope-OrgID` header

    **Session 2 — OpenTelemetry Fundamentals**
    - OTLP protocol, OTel Collector pipeline: receivers → processors → exporters
    - Agent Mode vs Gateway Mode deployment patterns
    - OpAMP: remote config push for OTel agents
    - memory_limiter and batch processor best practices

    **Session 3 — Data Collection Architecture**
    - Prometheus scrape (pull) vs OTLP push collection models
    - Envoy ext_authz pattern and the four-listener architecture
    - Cardinality management: what to avoid in metric labels

=== "Day 2"

    **Session 4 — Tenant Setup and Agent Deployment**
    - Tenant lifecycle: create, key management, usage monitoring
    - OpAMP enrollment: xse_ token → xag_ per-agent key exchange
    - Config templates with `${secret:NAME}` KMS-encrypted references
    - Label-selector assignments and priority-based config routing

    **Session 5 — Grafana Integration**
    - Grafana's role: pure visualisation, not storage
    - Three datasources: Prometheus (Mimir), Loki, Tempo
    - Cross-signal correlation: trace → log → metric
    - Managed Grafana vs self-managed options

    **Session 6 — Dashboards, APM and Alerting**
    - Four golden signals dashboards: latency, traffic, errors, saturation
    - Distributed tracing with TraceQL and the service map
    - Alert rules, contact points, notification policies, silences

    **Session 7 — Hands-On Lab**
    - Complete end-to-end workflow: tenant → API key → push data → dashboard → alert

---

## Key Concepts Reference

| Concept | Quick Summary |
|---|---|
| **Control Plane** | portal-api + portal-web + agent-api — manages configuration, not data |
| **Data Plane** | Envoy + proxy-auth + Mimir/Loki/Tempo — handles all telemetry |
| **X-Scope-OrgID** | The tenant namespace header — set by proxy-auth, never trusted from client |
| **ext_authz** | Envoy delegates auth to proxy-auth via gRPC before forwarding any request |
| **fail-closed** | If proxy-auth is unavailable, ALL requests are denied (security by default) |
| **OpAMP** | WebSocket protocol for pushing OTel config to agents |
| **xse_ token** | Fleet enrollment token — shared among all agents in a group |
| **xag_ key** | Per-agent API key — created during enrollment, unique to each agent |
| **${secret:NAME}** | Config template placeholder resolved via AWS KMS at delivery time |
| **NOTIFY/LISTEN** | PostgreSQL mechanism for near-real-time config push to agent-api |
| **Mimir** | Multi-tenant metrics: `multitenancy_enabled: true`, port 9009 |
| **Loki** | Multi-tenant logs: `auth_enabled: true`, HTTP 3100, gRPC 9095 |
| **Tempo** | Multi-tenant traces: `multitenancy_enabled: true`, HTTP 3200 |
| **mimir-sync** | Polls Mimir every 60s for usage → writes PostgreSQL rollup tables |
| **Four golden signals** | Latency, Traffic, Errors, Saturation — the foundation of SRE alerting |

---

## Next Steps

### Immediate (This Week)

- [ ] Review your organisation's current observability tooling
- [ ] Identify 2-3 services as pilot candidates for xScaler instrumentation
- [ ] Create a production tenant structure (one per environment)
- [ ] Test OTel collector configuration against your first service
- [ ] Schedule a follow-up session with your xScaler customer success manager

### Short-Term (30 Days)

- [ ] Deploy OTel DaemonSet to first Kubernetes cluster
- [ ] Create fleet enrollment token and enrol first agents
- [ ] Configure Grafana datasources and build service dashboards
- [ ] Create alert rules for four golden signals
- [ ] Document your tenant naming convention in your team wiki

### Long-Term (90 Days)

- [ ] Complete fleet rollout across all production clusters
- [ ] Review cardinality (monthly) — check series count trends
- [ ] Instrument all services with OTel SDK for traces
- [ ] Establish SLO dashboards for critical services
- [ ] Train additional team members using this training site

---

## Additional Resources

### xScaler Documentation

- [Architecture Reference](../architecture/platform-architecture.md) — deep-dive into platform design
- [Collector Configurations](../appendix/collector-configurations.md) — ready-to-use YAML configs
- [API Examples](../appendix/api-examples.md) — complete curl reference
- [Troubleshooting Guide](../appendix/troubleshooting.md) — diagnostic procedures

### External Resources

- [OpenTelemetry Docs](https://opentelemetry.io/docs/) — OTel SDK and Collector reference
- [Grafana Documentation](https://grafana.com/docs/) — Dashboard and alerting reference
- [Prometheus Documentation](https://prometheus.io/docs/) — PromQL reference
- [Grafana Mimir Documentation](https://grafana.com/docs/mimir/) — Mimir architecture
- [Grafana Loki Documentation](https://grafana.com/docs/loki/) — LogQL reference
- [Grafana Tempo Documentation](https://grafana.com/docs/tempo/) — TraceQL reference

### Support Channels

- **xScaler Portal** — `https://portal.xscalerlabs.com`
- **Support tickets** — via portal → Support menu
- **Status page** — `https://status.xscalerlabs.com`

---

## Feedback

Please complete the training feedback form provided by your instructor. Your feedback helps us improve the training programme for future participants.

---

!!! success "You're Ready!"
    You now have the knowledge to deploy, configure, and operate the xScaler Observability Platform in production. Start with a single team's services, prove the value, and expand from there. The platform scales from a single DaemonSet to thousands of agents across multiple regions.

---

*← Previous: [Lab Guide](lab-guide.md)*  
*Next: [Architecture Reference →](../architecture/platform-architecture.md)*
