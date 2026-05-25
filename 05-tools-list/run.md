# run.md - Module 05

## Prerequisites

Node.js 20 or later. Run from the project root (`mcp-from-scratch/`). Modules 02–04 must be present (this module imports their code).

---

## 1. Run the tool discovery demo

The client spawns the server, completes the handshake, then calls `tools/list` and prints each tool.

```bash
node 05-tools-list/src/client.js
```

Expected output (tool order is alphabetical by name):

```
[client] starting MCP handshake

tools/list before init → rejected (expected): Server not initialized: send initialize first
initialize → server: mcp-from-scratch
  tools capability: {"listChanged":true}

[client] handshake complete, session state: READY

--- tool discovery ---

[client] tools/list → 3 tool(s)

  • add
    title:       Add numbers
    description: Adds two numbers and returns the sum.
    parameters:  a, b

  • echo
    title:       Echo
    description: Returns the message you send, unchanged.
    parameters:  message

  • get_time
    title:       Current time
    description: Returns the server clock as an ISO-8601 timestamp.
    parameters:  (none)

[client] done, closing connection
```

What to check:

- `tools/list` before initialize is rejected - same lifecycle rules as module 04.
- After handshake, `tools/list` returns three tools.
- Each tool shows `name`, `description`, and parameter names from `inputSchema`.
- The process exits cleanly.

---

## 2. Drive the server manually

Start the server and send JSON lines yourself.

```bash
node 05-tools-list/src/server.js
```

**Initialize** (one line):

```
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"manual","version":"1.0.0"}}}
```

**Send initialized** (no `id`):

```
{"jsonrpc":"2.0","method":"notifications/initialized"}
```

**List tools:**

```
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

You should get a `result` with a `tools` array containing `add`, `echo`, and `get_time`.

Press `Ctrl-D` to send EOF and exit.

---

## Troubleshooting

**`Error: Cannot find module '../../04-lifecycle/...'`** - run from the project root. Earlier modules must exist alongside `05-tools-list`.

**`tools/list` returns Method not found** - you are running an old server binary or the wrong [server.js](./src/server.js). Use [05-tools-list/src/server.js](./src/server.js).

**Empty `tools` array** - the registry in [server.js](./src/server.js) failed to register tools; check for thrown validation errors at startup.

**`tools/list` rejected after initialize** - you forgot `notifications/initialized`. Send it before listing tools.
