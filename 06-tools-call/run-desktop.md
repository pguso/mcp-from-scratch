# run-desktop.md - Module 06 (Claude Desktop)

Claude is the host. You need Node.js and Claude Desktop installed.

**Other path?** [run-local.md](./run-local.md)

---

## Prerequisites

Node.js 20 or later. Run from the project root (`mcp-from-scratch/`). Modules 02–05 must be present.

---

## 1. Run the tool invocation demo

Same check as the local path - proves the server before you touch Desktop config. Run the following without errors:

```bash
node 06-tools-call/src/client.js
```

What to check:

- `tools/call` before initialize is rejected.
- `echo`, `add`, and `get_time` return the expected text.
- Unknown tool → JSON-RPC error, not `isError: true`.
- Process exits cleanly.

If this fails, fix the server before step 2 or 3.

---

## 2. Prove the server in Inspector (optional)

```bash
npx -y @modelcontextprotocol/inspector node /ABSOLUTE/PATH/TO/mcp-from-scratch/06-tools-call/src/server.js
```

The browser will say **“Connect to an MCP server to start inspecting”** until you connect.

**Follow [`src/inspector.md`](./src/inspector.md)** step by step:

1. Open the **URL from the terminal** (with `MCP_PROXY_AUTH_TOKEN=…`).
2. Server Connection: **STDIO**, command `node`, arguments = your absolute path to `server.js`.
3. Click **Connect**.
4. **Tools** tab → `echo` → `{ "message": "test" }` → result text is `test`.

If that works, the server is fine - go to step 3. Inspector cannot show Claude Desktop's calls later - see [`src/inspector.md`](./src/inspector.md#inspector-cannot-show-claude-desktops-mcp-calls).

---

## 3. Wire Claude Desktop

1. **[`src/connect.md`](./src/connect.md)** - shared JSON config
2. **Your OS:**
   - macOS: [`src/connect-macos.md`](./src/connect-macos.md)
   - Windows: [`src/connect-windows.md`](./src/connect-windows.md)
   - Linux: [`src/connect-linux.md`](./src/connect-linux.md)

Quit Claude completely, reopen, start a **new chat**, confirm tools appear.

**Done** when Claude can call your tools in chat.

If Desktop misbehaves later: [`src/inspector.md`](./src/inspector.md) and [`src/connect.md`](./src/connect.md).

---

## Troubleshooting

**`Cannot find module '../../05-tools-list/...'`** - run from repo root; module 05 must exist.

**`tools/call` returns Method not found** - use [06-tools-call/src/server.js](./src/server.js), not module 05.

**Step 1 passes, Desktop does not** - match absolute path in config; no `~` in JSON; full quit + new chat; read `mcp-server-*.log` (OS guide).

**Works in Inspector, not Desktop** - [`src/inspector.md`](./src/inspector.md#troubleshooting).
