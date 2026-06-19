import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'xScaler Training',
  tagline: 'Instructor-led training for the xScaler Observability Platform',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
  },

  url: 'https://learn.xscalerlabs.com',
  baseUrl: '/',

  organizationName: 'xscaler',
  projectName: 'training',
  trailingSlash: false,

  onBrokenLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.svg',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'xScaler Training',
      logo: {
        alt: 'xScaler Labs Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'trainingSidebar',
          position: 'left',
          label: 'Training',
        },
        {
          href: 'https://portal.xscalerlabs.com',
          label: 'Portal',
          position: 'right',
        },
        {
          href: 'https://github.com/xscalerlabs',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Training',
          items: [
            { label: 'Home', to: '/' },
            { label: 'Getting Started', to: '/getting-started' },
            { label: 'Session 1 — Platform Introduction', to: '/session-1/overview' },
            { label: 'Session 4 — Tenant Setup', to: '/session-4/overview' },
          ],
        },
        {
          title: 'Labs',
          items: [
            { label: 'Lab 01 — Tenant Creation', to: '/labs/lab-01-tenant-creation' },
            { label: 'Lab 02 — Agent Deployment', to: '/labs/lab-02-agent-deployment' },
            { label: 'Lab 04 — Grafana Setup', to: '/labs/lab-04-grafana' },
          ],
        },
        {
          title: 'Resources',
          items: [
            { label: 'Portal', href: 'https://portal.xscalerlabs.com' },
            { label: 'xScaler GitHub', href: 'https://github.com/xscalerlabs' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} xScaler Ltd.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['bash', 'yaml', 'python', 'go', 'promql'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
