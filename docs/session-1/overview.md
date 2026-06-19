# Session 1 — Platform Introduction and User Management

## Session Overview

**Duration:** 2 hours  
**Format:** Instructor presentation + live demo  
**Level:** Introductory

---

## Session Agenda

| Time | Topic | Format |
|---|---|---|
| 0:00 – 0:30 | Platform introduction and architecture walkthrough | Presentation |
| 0:30 – 1:00 | User management: roles, Cognito, JWT auth | Presentation + Demo |
| 1:00 – 1:30 | Observability fundamentals: metrics, logs, traces | Presentation |
| 1:30 – 2:00 | Live portal demo + Q&A | Demo |

---

## Learning Objectives

By the end of Session 1, you will be able to:

- [ ] Describe the xScaler platform architecture and component roles
- [ ] Explain the two-tier deployment model (control plane vs edge)
- [ ] Explain the authentication flow from browser login to JWT
- [ ] Navigate the portal UI: create an organisation, manage members
- [ ] Define the three observability signals: metrics, logs, traces
- [ ] Explain which xScaler backend component handles each observability signal

---

## Session Pages

1. [Platform Introduction](platform-introduction.md) — architecture, components, deployment topology
2. [User Management](user-management.md) — authentication, authorisation, roles, Cognito
3. [Observability Fundamentals](observability-fundamentals.md) — metrics, logs, traces and the xScaler stack

---

## Key Concepts Introduced

| Concept | Description |
|---|---|
| Control Plane | `portal-api`, `portal-web`, `agent-api` — manages configuration |
| Data Plane | Envoy + `proxy-auth` + xMetrics/xLogs/xTraces — handles telemetry |
| Multi-tenancy | `X-Scope-OrgID` header isolates data per tenant |
| JWT Authentication | HS256, 30-minute TTL, stored in HttpOnly cookie |
| Cognito Integration | AWS Cognito → exchange for xScaler JWT |
| Three Signals | Metrics (xMetrics), Logs (xLogs), Traces (xTraces) |

---

## Instructor Notes

:::tip[Trainer Guidance]

- Open the portal at `https://portal.xscalerlabs.com` during presentation
- Walk through the UI live as you explain each component
- Emphasise the separation between control plane and data plane — this is the single most important architectural concept
- Students often conflate Grafana with the backend — clarify that Grafana is purely a visualisation layer

:::

---

*← Previous: [Getting Started](../getting-started.md)*  
*Next: [Platform Introduction →](platform-introduction.md)*
