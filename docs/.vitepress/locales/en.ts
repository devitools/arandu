import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress'

export const en: LocaleSpecificConfig<DefaultTheme.Config> = {
  title: 'Arandu',
  description: 'Markdown viewer and AI workspace',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/en/guide/introduction', activeMatch: '/en/guide/' },
      { text: 'Features', link: '/en/features/markdown', activeMatch: '/en/features/' },
      { text: 'Reference', link: '/en/reference/cli', activeMatch: '/en/reference/' },
      {
        text: 'Download',
        link: 'https://github.com/devitools/arandu/releases/latest'
      }
    ],
    sidebar: {
      '/en/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/en/guide/introduction' },
            { text: 'Installation', link: '/en/guide/installation' },
            { text: 'Quick Start', link: '/en/guide/quick-start' }
          ]
        },
        {
          text: 'Essentials',
          items: [
            { text: 'Viewing Markdown', link: '/en/guide/viewing-markdown' },
            { text: 'Navigation', link: '/en/guide/navigation' },
            { text: 'Themes', link: '/en/guide/themes' },
            { text: 'Keyboard Shortcuts', link: '/en/guide/shortcuts' }
          ]
        }
      ],
      '/en/features/': [
        {
          text: 'Viewing',
          items: [
            { text: 'Markdown', link: '/en/features/markdown' },
            { text: 'Live Reload', link: '/en/features/live-reload' },
            { text: 'Themes', link: '/en/features/themes' }
          ]
        },
        {
          text: 'Voice',
          items: [
            { text: 'Whisper', link: '/en/features/whisper' },
            { text: 'Whisper Configuration', link: '/en/features/whisper-config' }
          ]
        },
        {
          text: 'Workspace',
          items: [
            { text: 'Workspace', link: '/en/features/workspace' },
            { text: 'Sessions & Modes', link: '/en/features/sessions' },
            { text: 'Plan', link: '/en/features/plan' }
          ]
        },
        {
          text: 'Review',
          items: [
            { text: 'Comments', link: '/en/features/comments' },
            { text: 'Review', link: '/en/features/review' },
            { text: 'Integrations', link: '/en/features/integrations' }
          ]
        }
      ],
      '/en/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'CLI', link: '/en/reference/cli' },
            { text: 'IPC', link: '/en/reference/ipc' },
            { text: 'Settings', link: '/en/reference/settings' },
            { text: 'Languages', link: '/en/reference/languages' }
          ]
        }
      ]
    },
    editLink: {
      pattern: 'https://github.com/devitools/arandu/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },
    lastUpdated: {
      text: 'Updated at',
      formatOptions: { dateStyle: 'short' }
    },
    docFooter: {
      prev: 'Previous',
      next: 'Next'
    },
    outline: {
      label: 'On this page'
    },
    returnToTopLabel: 'Return to top',
    sidebarMenuLabel: 'Menu',
    darkModeSwitchLabel: 'Theme',
    lightModeSwitchTitle: 'Switch to light mode',
    darkModeSwitchTitle: 'Switch to dark mode',
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024 devitools'
    }
  }
}
