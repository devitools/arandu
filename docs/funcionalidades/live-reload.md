# Live Reload

O Arandu observa o arquivo aberto e atualiza automaticamente o preview quando o arquivo é modificado.

## Como funciona

1. Você abre um arquivo `.md` no Arandu
2. Edita o arquivo em qualquer editor (VS Code, Vim, nano, etc.)
3. Ao salvar, o Arandu detecta a mudança e rerenderiza instantaneamente

Não é necessária nenhuma extensão de browser nem configuração especial.

## Implementação

O file watching é implementado no backend Rust usando a crate [notify](https://docs.rs/notify/). O Arandu monitora o arquivo via inotify (Linux), FSEvents (macOS) ou ReadDirectoryChangesW (Windows).

## Casos de uso

### Edição com VS Code

```bash
code meu-documento.md   # abre no VS Code
arandu meu-documento.md # abre o preview no Arandu
```

Edite no VS Code, veja o resultado no Arandu em tempo real.

### Pipeline com scripts

```bash
# Gera Markdown e abre preview
python gerar-relatorio.py > relatorio.md
arandu relatorio.md
```

### Com agentes de IA

Quando um agente de codificação está gerando ou editando um plano `.md`, o Arandu exibe as mudanças em tempo real.

## Comportamento

- O scroll é preservado após o reload (quando possível)
- Se o arquivo for deletado, o Arandu exibe uma mensagem de aviso
- O watching é cancelado automaticamente quando a janela é fechada
