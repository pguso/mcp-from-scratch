# run.md - Module 02

## Prerequisites

Node.js 20 or later. Run `node --version` to check.

---

## 1 Run the jsonrpc.js demo

This file has no dependencies and no I/O. It exercises every encode and decode path and prints results to stdout.

```bash
node 02-json-rpc/src/jsonrpc.js
```

Expected output:

```
=== 1. Wire format: JSON strings we send on stdin/stdout ===

request:      {"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
response:     {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}
error:        {"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"Method not found"}}
notification: {"jsonrpc":"2.0","method":"notifications/initialized","params":{}}

=== 2. After decode(): same messages as typed objects (type = request | response | error | notification) ===

type=request      {"type":"request","id":1,"method":"tools/list","params":{}}
type=response     {"type":"response","id":1,"result":{"tools":[]}}
type=error        {"type":"error","id":1,"error":{"code":-32601,"message":"Method not found"}}
type=notification {"type":"notification","method":"notifications/initialized","params":{}}

=== 3. Invalid input: decode() throws { code, message } (dispatcher turns these into error responses) ===

not json: code=-32700 message="Parse error"
wrong version: code=-32600 message="Invalid request: jsonrpc must be "2.0""
array: code=-32600 message="Invalid request: not an object"
empty object: code=-32600 message="Invalid request: jsonrpc must be "2.0""
```

What to check:
- Each encoded line starts with `{"jsonrpc":"2.0"` and ends with no trailing whitespace.
- Requests and responses carry matching `id` values.
- Notifications have no `id` field.
- All four error inputs produce a structured `{ code, message }` - never an uncaught exception.

---

## 2 Run the dispatcher.js demo

This demo registers two handlers, then feeds five messages through the dispatcher: a valid request, a request for an unknown method, a notification, an unparseable line, and valid-JSON-but-invalid-JSON-RPC.

```bash
node 02-json-rpc/src/dispatcher.js
```

Expected output:

```
=== Dispatcher demo ===

  [notification received: notifications/initialized]

--- Output messages ---

{"jsonrpc":"2.0","id":2,"error":{"code":-32601,"message":"Method not found: tools/call"}}
{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}
{"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"Invalid request: missing method, result, or error"}}
{"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"echo","description":"Returns its input","inputSchema":{}}]}}
```

The output messages may appear in a different order from the input messages. That is expected: the demo dispatches all five messages concurrently with `Promise.all`, so async handlers can resolve out of order.

What to check:
- The `tools/list` request (id=1) gets a `result` back.
- The `tools/call` request (id=2) gets a `MethodNotFound` error because no handler is registered.
- The notification produces a console log but no output message - there is no id=3 response in the output.
- The unparseable input produces a `ParseError` with `id: null`.
- The invalid JSON-RPC object produces an `InvalidRequest` with `id: null`.

---

## Troubleshooting

**`SyntaxError: Cannot use import statement`** - you are running with a Node.js version below 12, or [package.json](../package.json) is missing. Check that [package.json](../package.json) at the project root contains `"type": "module"`.

**Output order is different** - that is fine for the dispatcher demo; async resolution order is non-deterministic. The important thing is that every input produces the expected output, regardless of order.

**Extra output lines** - make sure you are running from the project root (`mcp-from-scratch/`), not from inside the `02-json-rpc/` folder. The `node` invocation should start with `node 02-json-rpc/src/…`.
