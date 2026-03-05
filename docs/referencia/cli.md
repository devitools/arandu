# CLI — Linha de Comando

## Instalação

A CLI é instalada automaticamente na primeira abertura do Arandu (macOS) ou pode ser instalada via menu **Arandu → Instalar Ferramenta de Linha de Comando…**.

Via Homebrew:
```bash
brew install --cask devitools/arandu/arandu
```

## Uso básico

```bash
arandu                          # abre o seletor de arquivo
arandu README.md                # abre um arquivo
arandu doc1.md doc2.md          # abre múltiplos arquivos
arandu *.md                     # abre todos os .md do diretório
arandu /caminho/para/projeto    # abre como workspace
```

## Flags

| Flag | Descrição |
|------|-----------|
| `--version` | Exibe a versão instalada |
| `--help` | Exibe ajuda |

## Comportamento

- Se o Arandu já estiver rodando, os arquivos são abertos via IPC (sem nova janela do app)
- Se o Arandu não estiver rodando, o app é iniciado automaticamente

## Caminho de instalação

| Sistema | Caminho |
|---------|---------|
| macOS | `/usr/local/bin/arandu` |
| Linux | `~/.local/bin/arandu` |

## Script da CLI

A CLI é um script shell que se comunica com o Arandu via IPC:

```bash
#!/bin/bash
# Tenta via socket Unix, fallback para TCP
if [ -S "$HOME/.arandu/arandu.sock" ]; then
  echo '{"command":"open","args":["'"$1"'"]}' \
    | socat - UNIX-CONNECT:$HOME/.arandu/arandu.sock
else
  echo '{"command":"open","args":["'"$1"'"]}' | nc 127.0.0.1 7474
fi
```
