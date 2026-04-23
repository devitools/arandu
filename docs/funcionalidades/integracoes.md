# Integrações

## Shell aliases

Configure aliases para integrar o Arandu ao seu fluxo de trabalho:

```bash
# Abrir documentação de um projeto
alias docs='arandu README.md'

# Usar Arandu como EDITOR para agentes
alias claude='EDITOR=arandu claude'
```

## Variável EDITOR

O Arandu pode ser usado como editor padrão (`$EDITOR`) para qualquer aplicativo que abre arquivos para edição:

```bash
export EDITOR=arandu
```

## IPC (Inter-Process Communication)

O Arandu expõe duas interfaces IPC para automação e integração:

### Unix Socket (macOS/Linux)
```
~/.arandu/arandu.sock
```

### TCP
```
127.0.0.1:7474
```

### Comandos disponíveis

| Comando | Descrição |
|---------|-----------|
| `open <arquivo>` | Abre um arquivo no Arandu |
| `ping` | Health check |
| `show` | Traz o Arandu para o foco |

### Exemplo de uso

```bash
# Abrir arquivo via TCP
echo '{"command":"open","args":["README.md"]}' | nc 127.0.0.1 7474

# Health check
echo '{"command":"ping"}' | nc 127.0.0.1 7474
```

## Multi-janela

O Arandu suporta múltiplas janelas simultâneas, cada uma com seu próprio arquivo. Isso permite comparar documentos lado a lado.

## Integração com editores

### VS Code
Use a tarefa integrada para abrir o preview no Arandu:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Preview no Arandu",
      "type": "shell",
      "command": "arandu ${file}"
    }
  ]
}
```

### Neovim

```lua
-- Abrir arquivo atual no Arandu
vim.keymap.set('n', '<leader>mp', function()
  vim.fn.system('arandu ' .. vim.fn.expand('%'))
end)
```
