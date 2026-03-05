import { defineConfig } from 'vitepress'
import { ptBR } from './locales/pt-BR'
import { en } from './locales/en'

export default defineConfig({
  title: 'Arandu',
  description: 'Markdown viewer and AI workspace',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
      }
    ],
    ['meta', { name: 'theme-color', content: '#2D1B69' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Arandu — Markdown viewer and AI workspace' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'Markdown viewer and AI workspace for macOS, Linux, and Windows.'
      }
    ]
  ],

  locales: {
    root: {
      label: 'Português',
      lang: 'pt-BR',
      ...ptBR
    },
    en: {
      label: 'English',
      lang: 'en-US',
      ...en
    }
  },

  themeConfig: {
    logo: '/icon.svg',
    socialLinks: [{ icon: 'github', link: 'https://github.com/devitools/arandu' }],
    search: {
      provider: 'local'
    }
  }
})
