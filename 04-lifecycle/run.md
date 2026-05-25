# run.md - Module 04

## Prerequisites

Node.js 20 or later. Run from the project root (`mcp-from-scratch/`).

---

## 1 Run the full handshake demo

The client spawns the server, attempts a request before initialize (rejected), completes the handshake, then calls `ping` and `echo`.

```bash
node 04-lifecycle/src/client.js
```

Expected output (the timestamp will differ):

```
[client] starting MCP handshake

echo before init → rejected (expected): Server not initialized: send initialize first

initialize →
  protocolVersion: 2025-11-25
  serverInfo:      { name: 'mcp-from-scratch', version: '0.1.0' }
  capabilities:    {"tools":{"listChanged":true}}

[client] handshake complete, session state: READY

--- requests after handshake ---

ping → { time: '2026-05-19T12:00:00.000Z' }
echo → {"echo":{"message":"hello after init"}}
re-initialize → rejected (expected): Initialize already called

[client] done, closing connection
```

What to check:

- `echo before init` is rejected with a clear message - not a crash.
- `initialize` returns `protocolVersion`, `serverInfo`, and `capabilities`.
- Session state is `READY` after the handshake.
- `ping` and `echo` succeed only after initialization.
- A second `initialize` is rejected.
- The process exits cleanly.

---

## 2 Drive the server manually

Start the server and type JSON lines yourself to see the state machine in action.

```bash
node 04-lifecycle/src/server.js
```

**Before initialize** - `echo` is rejected:

```
{"jsonrpc":"2.0","id":1,"method":"echo","params":{"x":1}}
```

Expected:

```
{"jsonrpc":"2.0","id":1,"error":{"code":-32600,"message":"Server not initialized: send initialize first"}}
```

**Initialize** - paste this (one line):

```
{"jsonrpc":"2.0","id":2,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"manual","version":"1.0.0"}}}
```

You should get a result with `protocolVersion` and `serverInfo`.

**Send initialized** - still no `id` field:

```
{"jsonrpc":"2.0","method":"notifications/initialized"}
```

No response is printed (notifications do not get replies).

**Now echo works:**

```
{"jsonrpc":"2.0","id":3,"method":"echo","params":{"hello":"world"}}
```

Press `Ctrl-D` to send EOF and exit.

---

## Troubleshooting

**`Error: Cannot find module '../../02-json-rpc/...'`** - run from the project root. Import paths are relative to each source file, but the `02-json-rpc` and `03-stdio-transport` folders must exist alongside `04-lifecycle`.

**The process hangs** - when running [server.js](./src/server.js) directly, send EOF with `Ctrl-D`. When running [client.js](./src/client.js), the client closes stdin when finished.

**`initialize` succeeds but `echo` still fails** - you forgot step 3. Send `notifications/initialized` before other requests.

**Protocol version error** - the server accepts `2025-11-25` and `2025-06-18`. Any other `protocolVersion` string returns InvalidParams.
