import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  trainingSidebar: [
    // ── Introduction ─────────────────────────────────────────────────────────
    'index',
    'getting-started',

    // ── Session 1 ─────────────────────────────────────────────────────────────
    {
      type: 'category',
      label: 'Session 1 — Platform Introduction',
      collapsed: false,
      items: [
        'session-1/overview',
        'session-1/platform-introduction',
        'session-1/user-management',
        'session-1/observability-fundamentals',
      ],
    },

    // ── Session 2 ─────────────────────────────────────────────────────────────
    {
      type: 'category',
      label: 'Session 2 — OpenTelemetry Fundamentals',
      collapsed: true,
      items: [
        'session-2/overview',
        'session-2/otel-overview',
        'session-2/collector-components',
        'session-2/deployment-models',
        'session-2/agent-vs-gateway',
      ],
    },

    // ── Session 3 ─────────────────────────────────────────────────────────────
    {
      type: 'category',
      label: 'Session 3 — Data Collection Architecture',
      collapsed: true,
      items: [
        'session-3/overview',
        'session-3/metrics-collection',
        'session-3/architecture-review',
        'session-3/customer-workshop',
      ],
    },

    // ── Session 4 ─────────────────────────────────────────────────────────────
    {
      type: 'category',
      label: 'Session 4 — Tenant Setup and Agent Deployment',
      collapsed: true,
      items: [
        'session-4/overview',
        'session-4/tenant-administration',
        'session-4/agent-deployment',
        'session-4/agent-registration',
        'session-4/configuration-management',
      ],
    },

    // ── Session 5 ─────────────────────────────────────────────────────────────
    {
      type: 'category',
      label: 'Session 5 — Grafana Integration',
      collapsed: true,
      items: [
        'session-5/overview',
        'session-5/grafana-overview',
        'session-5/deployment-options',
        'session-5/datasource-configuration',
      ],
    },

    // ── Session 6 ─────────────────────────────────────────────────────────────
    {
      type: 'category',
      label: 'Session 6 — Dashboards, APM and Alerting',
      collapsed: true,
      items: [
        'session-6/overview',
        'session-6/dashboard-creation',
        'session-6/apm',
        'session-6/alerting',
      ],
    },

    // ── Session 7 ─────────────────────────────────────────────────────────────
    {
      type: 'category',
      label: 'Session 7 — Hands-On Lab and Q&A',
      collapsed: true,
      items: [
        'session-7/overview',
        'session-7/lab-guide',
        'session-7/wrap-up',
      ],
    },

    // ── Labs ──────────────────────────────────────────────────────────────────
    {
      type: 'category',
      label: 'Labs',
      collapsed: false,
      items: [
        'labs/lab-01-tenant-creation',
        'labs/lab-02-agent-deployment',
        'labs/lab-03-registration',
        'labs/lab-04-grafana',
        'labs/lab-05-dashboard',
        'labs/lab-06-alerting',
      ],
    },

    // ── Appendix ──────────────────────────────────────────────────────────────
    {
      type: 'category',
      label: 'Appendix',
      collapsed: true,
      items: [
        'appendix/collector-configurations',
        'appendix/ansible-playbooks',
        'appendix/api-examples',
        'appendix/troubleshooting',
      ],
    },
  ],
};

export default sidebars;
