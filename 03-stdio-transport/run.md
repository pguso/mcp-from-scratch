# run.md - Module 03

## Prerequisites

Node.js 20 or later. Run from the project root (`mcp-from-scratch/`).

---

## 1 Run the client → server ping

The client spawns the server, sends one `ping` request, prints the result, and exits.

```bash
node 03-stdio-transport/src/client.js
```

Expected output:

```
[client] spawning server…
ping → { reply: 'pong' }
[client] closing connection
```

What to check:
- `ping` returns `{ reply: 'pong' }`.
- The process exits cleanly with no hanging or error output.

---

## 2 Talk to the server manually

You can drive the server directly from your terminal to see exactly what it reads and writes.

```bash
node 03-stdio-transport/src/server.js
```

The server starts and waits. Type (or paste) a JSON line and press Enter:

```
{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}
```

You should see the response printed immediately:

```
{"jsonrpc":"2.0","id":1,"result":{"reply":"pong"}}
```

Press `Ctrl-D` (macOS/Linux) or `Ctrl-Z` then Enter (Windows) to send EOF and exit the server.

---

## 3 Observe the framing problem directly

Use `printf` to send two requests in a single write - simulating a chunk that contains multiple messages:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}\n{"jsonrpc":"2.0","id":2,"method":"ping","params":{}}\n' \
  | node 03-stdio-transport/src/server.js
```

Expected output (two responses, one per line):

```
{"jsonrpc":"2.0","id":1,"result":{"reply":"pong"}}
{"jsonrpc":"2.0","id":2,"result":{"reply":"pong"}}
```

Both messages are handled correctly even though they arrived as a single chunk. This is the framing problem solved.

---

## 4 Try more methods (optional)

This module's server only implements `ping`. To experiment with errors and extra methods, add handlers to [src/server.js](./src/server.js) temporarily (or use module 02's dispatcher demo), then type requests manually as in section 2.

**Unknown method** - expect a JSON-RPC error:

```
{"jsonrpc":"2.0","id":1,"method":"nonexistent/method","params":{}}
```

```
{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"Method not found: nonexistent/method"}}
```

**Custom `echo` handler** - register in [server.js](./src/server.js):

```js
dispatcher.register('echo', async (params) => ({ echo: params }));
```

Then send:

```
{"jsonrpc":"2.0","id":2,"method":"echo","params":{"hello":"world"}}
```

**Custom `add` handler with validation**:

```js
dispatcher.register('add', async (params) => {
  const { a, b } = params;
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw { code: -32602, message: 'Invalid params: a and b must be numbers' };
  }
  return { result: a + b };
});
```

Then try valid and invalid params:

```
{"jsonrpc":"2.0","id":3,"method":"add","params":{"a":10,"b":32}}
{"jsonrpc":"2.0","id":4,"method":"add","params":{"a":"oops","b":1}}
```

Those patterns are exercised automatically in module 02 (`dispatcher.js`) and again after the lifecycle handshake in module 04.

---

## Troubleshooting

**The process hangs after the last line** - you are running [server.js](./src/server.js) directly and have not sent EOF. Press `Ctrl-D`.

**`Error: Cannot find module '../../02-json-rpc/src/dispatcher.js'`** - run from the project root, not from inside `03-stdio-transport/`. The import path is relative to the source file, but Node.js resolves it from the file's location, so the path itself is correct only when the project structure is intact.

**Responses are out of order** - that is fine. The client uses a `pending` map keyed by `id`, so responses are matched to their requests regardless of arrival order. Later modules send multiple requests; the same mechanism applies.

**Server does not exit after client finishes** - check that `process.stdin.on('end', ...)` is present in [server.js](./src/server.js). Without it the server's event loop stays alive waiting for more input even after EOF.
