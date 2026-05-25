# run.md - Module 07

## Prerequisites

Node.js 20 or later. Run from the project root (`mcp-from-scratch/`).

---

## 1. Run the error-handling demo

The client spawns the server, completes the handshake, then exercises both error paths.

```bash
node 07-errors/src/client.js
```

Expected output (wording must match; line breaks may differ slightly):

```
[client] starting MCP handshake

tools/call before init → rejected (expected): Server not initialized: send initialize first
initialize → server: mcp-from-scratch

[client] handshake complete, session state: READY

--- tool success (isError: false) ---

  echo → success
    isError: false
    text:    hello from MCP

  divide → success
    isError: false
    text:    2.5

--- tool execution errors (isError: true, still a JSON-RPC result) ---

  divide → tool error (b = 0)
    isError: true
    text:    division by zero: b must not be 0

  validate_email → tool error (bad format)
    isError: true
    text:    Invalid email format: "not-an-email". Expected something like user@example.com

  unstable → handler throw → tool error
    isError: true
    text:    upstream API unreachable

--- protocol errors (JSON-RPC error object, no result) ---

  unknown tool → protocol error
    JSON-RPC error code:    -32602
    JSON-RPC error message: Unknown tool: nonexistent

  missing name → protocol error
    JSON-RPC error code:    -32602
    JSON-RPC error message: Invalid params: name is required

  arguments must be object → protocol error
    JSON-RPC error code:    -32602
    JSON-RPC error message: Invalid params: arguments must be an object

[client] done, closing connection
```

What to check:

- Tool errors resolve the promise and set `isError: true` - they are **not** JSON-RPC errors.
- Protocol errors reject with `code` and `message` - there is no `result.content`.
- `divide` with `b: 0` is a tool error (model can retry with a different `b`).
- `nonexistent` tool is a protocol error (model must pick a real tool name).
- The process exits cleanly.

---

## 2. Drive the server manually

```bash
node 07-errors/src/server.js
```

**Initialize:**

```
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"manual","version":"1.0.0"}}}
```

**Send initialized:**

```
{"jsonrpc":"2.0","method":"notifications/initialized"}
```

**Tool error (valid request, failed execution):**

```
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"divide","arguments":{"a":1,"b":0}}}
```

You should get a `result` with `isError: true` and text about division by zero.

**Protocol error (unknown tool):**

```
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"nope","arguments":{}}}
```

You should get an `error` object with `code: -32602`, not a `result`.

Press `Ctrl-D` to send EOF and exit.

---

## 3. Explore errors.js directly

```bash
node -e "
import {
  invalidParams,
  toolError,
  toolSuccess,
  isProtocolError,
} from './07-errors/src/errors.js';

const pe = invalidParams('Unknown tool: x');
console.log('protocol throw:', pe);
console.log('isProtocolError:', isProtocolError(pe));

console.log('tool error:', toolError('bad input'));
console.log('tool success:', toolSuccess('ok'));
"
```

---

## Troubleshooting

**`Error: Cannot find module '../../05-tools-list/...'`** - run from the project root. Earlier modules must exist alongside `07-errors`.

**Divide by zero returns a JSON-RPC error instead of `isError: true`** - the handler should `return toolError(...)`, not `throw invalidParams(...)`.

**Unknown tool returns `isError: true`** - `tools/call` must `throw invalidParams('Unknown tool: ...')` before invoking a handler.

**Client treats tool errors as exceptions** - check `result.isError` on the resolved promise; only protocol errors reject.
