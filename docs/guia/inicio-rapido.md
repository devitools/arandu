# Início Rápido

Este guia leva você do zero a um arquivo Markdown aberto em menos de 2 minutos.

## 1. Instale o Arandu

```bash
# macOS via Homebrew
brew install --cask devitools/arandu/arandu

# Ou baixe em github.com/devitools/arandu/releases/latest
```

## 2. Abra um arquivo

### Via CLI

```bash
arandu README.md
```

### Via interface gráfica

Abra o Arandu e clique em **Abrir Arquivo** na tela inicial, ou arraste um arquivo `.md` para a janela.

### Via seletor de arquivo

Execute `arandu` sem argumentos para abrir o seletor de arquivo.

## 3. Explore a interface

```
┌──────────────────────────────────────┐
│  [≡] Arandu — README.md      [☀/☾]  │
├────────────┬─────────────────────────┤
│  OUTLINE   │                         │
│            │  # Título               │
│  > Título  │                         │
│    Seção 1 │  Parágrafo de texto...  │
│    Seção 2 │                         │
│            │  ## Seção 1             │
│            │  ...                    │
└────────────┴─────────────────────────┘
```

- **Outline lateral**: clique em qualquer heading para navegar
- **Botão de tema**: alterna entre sistema/claro/escuro
- **Live reload**: salve o arquivo em outro editor — o Arandu atualiza automaticamente

## 4. Próximos passos

- [Visualizando Markdown](/guia/visualizando-markdown) — saiba o que é suportado
- [Workspace com IA](/funcionalidades/workspace) — conecte um agente de codificação
- [Whisper](/funcionalidades/whisper) — configure voz para texto
