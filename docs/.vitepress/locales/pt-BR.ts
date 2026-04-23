import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress'

export const ptBR: LocaleSpecificConfig<DefaultTheme.Config> = {
  title: 'Arandu',
  description: 'Visualizador de Markdown e workspace com IA',
  themeConfig: {
    nav: [
      { text: 'Guia', link: '/guia/introducao', activeMatch: '/guia/' },
      { text: 'Funcionalidades', link: '/funcionalidades/markdown', activeMatch: '/funcionalidades/' },
      { text: 'Referência', link: '/referencia/cli', activeMatch: '/referencia/' },
      {
        text: 'Download',
        link: 'https://github.com/devitools/arandu/releases/latest'
      }
    ],
    sidebar: {
      '/guia/': [
        {
          text: 'Primeiros Passos',
          items: [
            { text: 'Introdução', link: '/guia/introducao' },
            { text: 'Instalação', link: '/guia/instalacao' },
            { text: 'Início Rápido', link: '/guia/inicio-rapido' }
          ]
        },
        {
          text: 'Essenciais',
          items: [
            { text: 'Visualizando Markdown', link: '/guia/visualizando-markdown' },
            { text: 'Navegação', link: '/guia/navegacao' },
            { text: 'Temas', link: '/guia/temas' },
            { text: 'Atalhos de Teclado', link: '/guia/atalhos' }
          ]
        }
      ],
      '/funcionalidades/': [
        {
          text: 'Visualização',
          items: [
            { text: 'Markdown', link: '/funcionalidades/markdown' },
            { text: 'Live Reload', link: '/funcionalidades/live-reload' },
            { text: 'Temas', link: '/funcionalidades/temas' }
          ]
        },
        {
          text: 'Voz',
          items: [
            { text: 'Whisper', link: '/funcionalidades/whisper' },
            { text: 'Configuração do Whisper', link: '/funcionalidades/whisper-config' }
          ]
        },
        {
          text: 'Workspace',
          items: [
            { text: 'Workspace', link: '/funcionalidades/workspace' },
            { text: 'Sessões e Modos', link: '/funcionalidades/sessoes' },
            { text: 'Plano', link: '/funcionalidades/plano' }
          ]
        },
        {
          text: 'Revisão',
          items: [
            { text: 'Comentários', link: '/funcionalidades/comentarios' },
            { text: 'Review', link: '/funcionalidades/review' },
            { text: 'Integrações', link: '/funcionalidades/integracoes' }
          ]
        }
      ],
      '/referencia/': [
        {
          text: 'Referência',
          items: [
            { text: 'CLI', link: '/referencia/cli' },
            { text: 'IPC', link: '/referencia/ipc' },
            { text: 'Configurações', link: '/referencia/configuracoes' },
            { text: 'Idiomas', link: '/referencia/idiomas' }
          ]
        }
      ]
    },
    editLink: {
      pattern: 'https://github.com/devitools/arandu/edit/main/docs/:path',
      text: 'Editar esta página no GitHub'
    },
    lastUpdated: {
      text: 'Atualizado em',
      formatOptions: { dateStyle: 'short' }
    },
    docFooter: {
      prev: 'Anterior',
      next: 'Próximo'
    },
    outline: {
      label: 'Nesta página'
    },
    returnToTopLabel: 'Voltar ao topo',
    sidebarMenuLabel: 'Menu',
    darkModeSwitchLabel: 'Tema',
    lightModeSwitchTitle: 'Mudar para modo claro',
    darkModeSwitchTitle: 'Mudar para modo escuro',
    footer: {
      message: 'Lançado sob a licença MIT.',
      copyright: 'Copyright © 2024 devitools'
    }
  }
}
