# IPC — Inter-Process Communication

Arandu exposes an IPC interface for automation and integration with external tools.

## Transports

### Unix Domain Socket (macOS/Linux)

```
~/.arandu/arandu.sock
```

Available only when Arandu is running.

### TCP

```
127.0.0.1:7474
```

Available on all platforms.

## Protocol

Messages are newline-terminated JSON (`\n`):

### Request

```json
{
  "command": "open",
  "args": ["/path/to/file.md"]
}
```

### Response

```json
{
  "success": true
}
```

Or on error:

```json
{
  "success": false,
  "error": "File not found"
}
```

## Commands

### open

Opens a file in Arandu.

```json
{
  "command": "open",
  "args": ["/absolute/path/to/file.md"]
}
```

### ping

Health check — verifies Arandu is running.

```json
{
  "command": "ping"
}
```

Response: `{"success": true, "result": "pong"}`

### show

Brings the Arandu window to focus.

```json
{
  "command": "show"
}
```

## Examples

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
