# run.md - Module 08

## Prerequisites

Node.js 20 or later. Run from the project root (`mcp-from-scratch/`). Modules 02–07 must be present (this module imports their code).

---

## 1. Run the resources demo

The client spawns the server, completes the handshake, lists resources, reads each one, then exercises error paths.

```bash
node 08-resources/src/client.js
```

Expected output (wording must match; timestamps in `server-info` JSON will differ):

```
[client] starting MCP handshake

resources/list before init → rejected (expected): Server not initialized: send initialize first
initialize → server: mcp-from-scratch
  resources capability: {"listChanged":true}

[client] handshake complete, session state: READY
--- resource discovery ---


[client] resources/list → 3 resource(s)

  • demo://glossary
    name:        glossary
    title:       MCP glossary
    description: Short definitions of core MCP concepts.
    mimeType:    text/plain

  • demo://server-info
    name:        server-info
    title:       Server metadata
    description: JSON snapshot of this teaching server.
    mimeType:    application/json

  • demo://welcome
    name:        welcome
    title:       Welcome note
    description: A short welcome message for the resources demo.
    mimeType:    text/markdown

--- read each listed resource ---

  resources/read → demo://glossary
    uri:      demo://glossary
    mimeType: text/plain
    text:     Host - Application that runs the AI and connects to MCP servers. Client - MCP connector inside the host; one per server …

  resources/read → demo://server-info
    uri:      demo://server-info
    mimeType: application/json
    text:     { "name": "mcp-from-scratch", "version": "0.1.0", "module": "08-resources", "time": "..." }

  resources/read → demo://welcome
    uri:      demo://welcome
    mimeType: text/markdown
    text:     # Welcome to MCP resources Resources are **read-only**. Use `resources/list` to discover them and `resources/read` to fe…

--- read errors ---

  unknown uri → Resource not found (-32002)
    JSON-RPC error code:    -32002
    JSON-RPC error message: Resource not found
    data:                   {"uri":"demo://does-not-exist"}

  missing uri → Invalid params (-32602)
    JSON-RPC error code:    -32602
    JSON-RPC error message: Invalid params: uri is required

[client] done, closing connection
```

What to check:

- `resources/list` before initialize is rejected - same lifecycle rules as tools.
- After handshake, `resources/list` returns three resources sorted by uri.
- `resources/read` returns a `contents` array with `text` for each demo resource.
- Unknown URI returns `-32002`, not a successful result with empty content.
- Missing `uri` returns `-32602`.
- The process exits cleanly.

---

## 2. Drive the server manually

```bash
node 08-resources/src/server.js
```

**Initialize:**

```
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"manual","version":"1.0.0"}}}
```

**Send initialized:**

```
{"jsonrpc":"2.0","method":"notifications/initialized"}
```

**List resources:**

```
{"jsonrpc":"2.0","id":2,"method":"resources/list","params":{}}
```

You should get a `result` with a `resources` array containing `demo://glossary`, `demo://server-info`, and `demo://welcome`.

**Read one resource:**

```
{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"demo://glossary"}}
```

You should get `result.contents[0].text` with the glossary lines.

**Resource not found:**

```
{"jsonrpc":"2.0","id":4,"method":"resources/read","params":{"uri":"demo://missing"}}
```

You should get `error.code: -32002`.

Press `Ctrl-D` to send EOF and exit.

---

## Troubleshooting

**`Error: Cannot find module '../../07-errors/...'`** - run from the project root. Earlier modules must exist alongside `08-resources`.

**`resources/list` returns Method not found** - you are running the wrong [server.js](./src/server.js). Use [08-resources/src/server.js](./src/server.js).

**Empty `resources` array** - registration failed at startup; check for validation errors in [src/registry.js](./src/registry.js).

**`resources/read` succeeds for unknown URIs** - the handler must throw `-32002` before calling a reader.

**`resources/list` rejected after initialize** - you forgot `notifications/initialized`. Send it before listing resources.
