# Introdução

**Arandu** <span class="pronunciation"><span class="ipa">/a.ɾan.ˈdu/</span></span> é um visualizador de Markdown e workspace com IA para macOS, Linux e Windows. O nome vem do Guarani e significa *sabedoria* — uma reflexão da sua missão: ser um espaço onde você lê, pensa e cria com clareza.

## Os três pilares

### 1. Visualizador de Markdown

Arandu renderiza GitHub Flavored Markdown com fidelidade total: tabelas, listas de tarefas, tachado, autolinks, blocos de código com realce de sintaxe. Abra qualquer arquivo `.md` e ele é exibido com tipografia limpa e navegação por outline lateral.

### 2. Workspace com IA

Conecte o GitHub Copilot (ou outro agente compatível com ACP) a um diretório de projeto. Trabalhe em sessões estruturadas com seis modos de interação: **ask**, **plan**, **code**, **edit**, **agent** e **autopilot**. Revise planos com comentários inline antes de executar.

### 3. Ferramenta de Revisão

Use o Arandu como seu `$EDITOR` ao trabalhar com agentes de codificação. O agente gera um plano → Arandu abre como editor → você comenta nos blocos inline → gera um prompt de revisão → feedback para o agente.

## Filosofia de design

- **Monocromático**: A interface não compete com o conteúdo. Fundo neutro, tipografia clara.
- **Focado em leitura**: Largura máxima, espaçamento generoso, sem distrações.
- **Offline-first**: Whisper roda no dispositivo. Sem dependências de nuvem.
- **Integração com o terminal**: CLI, IPC via socket Unix e TCP.

## Pré-requisitos

- macOS 13+, Linux x86_64, ou Windows x86_64
- Para o workspace com IA: GitHub Copilot CLI instalado localmente

## Próximos passos

- [Instalação](/guia/instalacao) — como instalar via Homebrew ou download manual
- [Início Rápido](/guia/inicio-rapido) — abra seu primeiro arquivo em 2 minutos
