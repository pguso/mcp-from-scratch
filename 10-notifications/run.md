# run.md - Module 10

## Prerequisites

Node.js 20 or later. Run from the project root (`mcp-from-scratch/`). Modules 02–08 must be present (this module imports their code).

---

## 1. Run the notifications demo

The client spawns the server, completes the handshake, subscribes to a live resource, calls tools that mutate server state, and reacts to each server-pushed notification.

```bash
node 10-notifications/src/client.js
```

Expected output (wording must match; tool/resource ordering is sorted alphabetically by name/uri):

```
[client] starting MCP handshake

initialize → server: mcp-from-scratch
  tools capability:      {"listChanged":true}
  resources capability:  {"listChanged":true,"subscribe":true}

[client] handshake complete, session state: READY
--- initial discovery ---

[client] tools/list → 3 tool(s): add_note, publish_status, register_extra_tool

[client] resources/list → 2 resource(s): demo://readme, demo://status

--- subscribe to demo://status ---

[client] resources/subscribe → demo://status (ok)

  resources/read → demo://status (before publish)
    text: Initial status (not yet published)

--- tools that push notifications ---

  tools/call → publish_status
    isError: false
    text:    Status published: All systems operational

[client] notification from server: notifications/resources/updated { uri: 'demo://status' }
[client] refreshed resources/read → demo://status
    text: All systems operational

  tools/call → add_note
    isError: false
    text:    Added resource demo://note/1

[client] notification from server: notifications/resources/list_changed {}
[client] refreshed resources/list → 3 resource(s): demo://note/1, demo://readme, demo://status

  tools/call → register_extra_tool
    isError: false
    text:    Registered tool: greet

[client] notification from server: notifications/tools/list_changed {}
[client] refreshed tools/list → 4 tool(s): add_note, greet, publish_status, register_extra_tool

[client] done, closing connection
```

What to check:

- Capabilities include `listChanged` for tools and resources, plus `subscribe` for resources.
- `resources/subscribe` succeeds before `publish_status` runs.
- `publish_status` triggers `notifications/resources/updated` with the subscribed URI; the client re-reads and shows the new text.
- `add_note` triggers `notifications/resources/list_changed`; the client re-lists and sees `demo://note/1`.
- `register_extra_tool` triggers `notifications/tools/list_changed`; the client re-lists and sees `greet`.
- Notifications have no `id` and produce no JSON-RPC error/response lines on the server side.
- The process exits cleanly.

---

## 2. Drive the server manually

```bash
node 10-notifications/src/server.js
```

**Initialize:**

```
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"manual","version":"1.0.0"}}}
```

**Send initialized:**

```
{"jsonrpc":"2.0","method":"notifications/initialized"}
```

**Subscribe to the live resource:**

```
{"jsonrpc":"2.0","id":2,"method":"resources/subscribe","params":{"uri":"demo://status"}}
```

**Publish new status (triggers updated notification on stdout):**

```
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"publish_status","arguments":{"message":"Manual publish"}}}
```

You should see a second line on stdout (no `id`):

```
{"jsonrpc":"2.0","method":"notifications/resources/updated","params":{"uri":"demo://status"}}
```

**Add a note resource (triggers list_changed):**

```
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"add_note","arguments":{}}}
```

Expect:

```
{"jsonrpc":"2.0","method":"notifications/resources/list_changed"}
```

Press `Ctrl-D` to send EOF and exit.

---

## Troubleshooting

**`Error: Cannot find module '../../08-resources/...'`** - run from the project root. Earlier modules must exist alongside `10-notifications`.

**No notifications appear** - the session must be READY. Send `notifications/initialized` before calling tools. For `resources/updated`, call `resources/subscribe` first.

**`resources/updated` never fires for `publish_status`** - you only subscribed to `demo://status`. Other URIs do not receive updated notifications.

**`register_extra_tool` returns isError** - `greet` was already registered in this server process; restart the server.

**Notifications logged but no refresh lines** - check that `handleServerNotification` is chained on the framer callback (see [client.js](./src/client.js)).
