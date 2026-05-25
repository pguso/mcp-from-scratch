# run-local.md - Module 06 (local only)

No Claude Desktop. Enough to finish modules 06–10.

**Other path?** [run-desktop.md](./run-desktop.md)

---

## Prerequisites

Node.js 20 or later. Run from the project root (`mcp-from-scratch/`). Modules 02–05 must be present.

---

## 1. Run the tool invocation demo

```bash
node 06-tools-call/src/client.js
```

Expected output (timestamps and ISO times will differ on your machine):

```
[client] starting MCP handshake

tools/call before init → rejected (expected): Server not initialized: send initialize first
initialize → server: mcp-from-scratch

[client] handshake complete, session state: READY

--- tool invocation ---

  tools/call → echo
    arguments: {"message":"hello from MCP"}
    isError:   false
    text:      hello from MCP

  tools/call → add
    arguments: {"a":40,"b":2}
    isError:   false
    text:      42

  tools/call → get_time
    arguments: {}
    isError:   false
    text:      2026-05-20T12:34:56.789Z

  unknown tool → protocol error (expected): Unknown tool: nonexistent

[client] done, closing connection
```

What to check:

- `tools/call` before initialize is rejected.
- `echo`, `add`, and `get_time` return the expected text.
- Unknown tool → JSON-RPC error, not `isError: true`.
- Process exits cleanly.

**Done?** You can stop here. Optional steps below.

---

## 2. Drive the server manually (optional)

```bash
node 06-tools-call/src/server.js
```

**Initialize:**

```
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"manual","version":"1.0.0"}}}
```

**Send initialized:**

```
{"jsonrpc":"2.0","method":"notifications/initialized"}
```

**Call echo:**

```
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"echo","arguments":{"message":"manual test"}}}
```

Expected: `content` with `{ "type": "text", "text": "manual test" }`, `isError: false`. Press `Ctrl-D` to exit.

---

## 3. MCP Inspector (optional)

```bash
npx -y @modelcontextprotocol/inspector node /ABSOLUTE/PATH/TO/mcp-from-scratch/06-tools-call/src/server.js
```

The browser will say **“Connect to an MCP server to start inspecting”** until you connect.

**Follow [`src/inspector.md`](./src/inspector.md)** step by step (token URL → STDIO → **Connect** → Tools → `echo`).

---

## Troubleshooting

**`Cannot find module '../../05-tools-list/...'`** - run from repo root; module 05 must exist.

**`tools/call` returns Method not found** - use [06-tools-call/src/server.js](./src/server.js), not module 05.

**Empty `content`** - check `textResult()` in [server.js](./src/server.js).

**Unknown tool returns `isError: true`** - server should return a JSON-RPC error for unknown names.
