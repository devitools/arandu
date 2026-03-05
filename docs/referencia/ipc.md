# IPC — Inter-Process Communication

O Arandu expõe uma interface IPC para automação e integração com ferramentas externas.

## Transportes

### Unix Domain Socket (macOS/Linux)

```
~/.arandu/arandu.sock
```

Disponível apenas quando o Arandu está rodando.

### TCP

```
127.0.0.1:7474
```

Disponível em todas as plataformas.

## Protocolo

As mensagens são JSON terminadas em newline (`\n`):

### Requisição

```json
{
  "command": "open",
  "args": ["/caminho/para/arquivo.md"]
}
```

### Resposta

```json
{
  "success": true
}
```

Ou em caso de erro:

```json
{
  "success": false,
  "error": "Arquivo não encontrado"
}
```

## Comandos

### open

Abre um arquivo no Arandu.

```json
{
  "command": "open",
  "args": ["/caminho/absoluto/para/arquivo.md"]
}
```

### ping

Health check — verifica se o Arandu está rodando.

```json
{
  "command": "ping"
}
```

Resposta: `{"success": true, "result": "pong"}`

### show

Traz a janela do Arandu para o foco.

```json
{
  "command": "show"
}
```

## Exemplos

### Bash

```bash
# Unix socket
echo '{"command":"open","args":["/home/user/docs/README.md"]}' \
  | socat - UNIX-CONNECT:$HOME/.arandu/arandu.sock

# TCP
echo '{"command":"open","args":["/home/user/docs/README.md"]}' \
  | nc 127.0.0.1 7474
```

### Python

```python
import socket
import json

def send_to_arandu(command, args=None):
    msg = json.dumps({"command": command, "args": args or []}) + "\n"
    with socket.create_connection(("127.0.0.1", 7474)) as s:
        s.sendall(msg.encode())
        return json.loads(s.recv(1024))

send_to_arandu("open", ["/path/to/file.md"])
```

### Node.js

```javascript
const net = require('net');

function sendToArandu(command, args = []) {
  return new Promise((resolve) => {
    const client = net.createConnection(7474, '127.0.0.1', () => {
      client.write(JSON.stringify({ command, args }) + '\n');
    });
    client.on('data', (data) => {
      resolve(JSON.parse(data.toString()));
      client.destroy();
    });
  });
}

await sendToArandu('open', ['/path/to/file.md']);
```
