# Wire MCP prompts to Claude Desktop or Cursor

Module 09 is the prompts milestone: a real MCP server that exposes **`prompts/list`** and **`prompts/get`**. Hosts show those prompts in the UI (prompt picker, + menu, or slash menu depending on the host) - not as automatic tool calls.

Pick a guide:

| Platform | Guide |
|----------|--------|
| macOS (Claude Desktop) | **[`connect-prompts-macos.md`](./connect-prompts-macos.md)** |
| Windows (Claude Desktop) | **[`connect-prompts-windows.md`](./connect-prompts-windows.md)** |
| Linux (Claude Desktop) | **[`connect-prompts-linux.md`](./connect-prompts-linux.md)** |
| Cursor | **[`connect-cursor.md`](./connect-cursor.md)** |

Before you connect a host, run the local demo in [`../run.md`](../run.md) so you know the server starts cleanly.

---

## Do not use the module 06 server for prompts

[Module 06](../06-tools-call/src/server.js) implements **tools only** (`tools/list`, `tools/call`). Claude Desktop will show the hammer / tools menu, but **no MCP prompt templates**.

For prompts, point config at **[09-prompts/src/server.js](./server.js)** and use a distinct config key such as **`mcp-from-scratch-prompts`** so you can run both servers while learning.

---

## Tools vs prompts in the host

| | Tools (module 06) | Prompts (module 09) |
|---|-------------------|------------------------|
| Protocol | `tools/list`, `tools/call` | `prompts/list`, `prompts/get` |
| Who triggers | Model (via host) | **User** |
| Typical UI | Hammer, tool approval | **+ menu** (Desktop), `/` or MCP panel (Cursor), `/mcp__…` (Code) |
| Wire on use | `tools/call` + arguments | `prompts/get` → **`messages[]`** in chat |
| Ask in chat? | “Use the echo tool…” works | User must pick the **prompt template** (UI varies) |

```
User picks "summarize" in the host UI (+ menu on Desktop, / on Cursor or Code)
  → Host: prompts/get { name, arguments }
  → Server: { messages: [{ role, content }] }
  → Host: inserts messages into the conversation
```

---

## Host UI differences

MCP prompts are user-selected templates, but **each host exposes them differently**:

| Host | How to invoke MCP prompts |
|------|---------------------------|
| **Claude Desktop** | **`+` → Add from [server name]** - not the `/` slash menu |
| **Claude Code** | `/mcp__<server>__<prompt>` in the slash menu |
| **Cursor** | `/` search or MCP Prompts panel |

Demo prompt names: `summarize`, `code_review`, `explain_concept`.

**Claude Desktop Konnektoren:** Servers with zero tools do not appear in the per-chat connector list. The module 09 server includes a `list_prompt_templates` tool so you can enable it alongside your tools server.

---

## Pre-flight without Desktop or Cursor

```bash
node 09-prompts/src/client.js
```

Confirm `prompts/list` returns three prompts and `prompts/get` prints message text.

Optional browser UI: **[`inspector.md`](./inspector.md)** - launch Inspector, use the **Prompts** tab to call `prompts/list` and `prompts/get` before debugging host UI.

```bash
npx -y @modelcontextprotocol/inspector node /ABSOLUTE/PATH/TO/mcp-from-scratch/09-prompts/src/server.js
```

---

## Shared config snippet

```json
{
  "mcpServers": {
    "mcp-from-scratch-prompts": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/mcp-from-scratch/09-prompts/src/server.js"
      ]
    }
  }
}
```

Rules:

- **`args`** must be the **absolute** path to [09-prompts/src/server.js](./server.js).
- Merge into existing `mcpServers` - do not delete your module 06 tools entry if you still use it.
- **Quit and restart** the host after edits (Desktop: full quit; Cursor: reload/restart per version).

---

## Verify in Claude Desktop (all platforms)

1. Open a **new** chat and enable **`mcp-from-scratch-prompts`** in Konnektoren (+ → Connectors).
2. Click **`+`** → **Add from mcp-from-scratch-prompts** → **`summarize`**.
3. Enter text when asked: `MCP prompts return messages, not tool results.`
4. Click **Add prompt**, then send - the conversation should contain the **templated user message**, not an echo **tool** result.

Also check **Settings → Developer** - server should show connected with **prompts** capability.

**Note:** Typing **`/`** in Claude Desktop shows built-in slash commands only. That is expected; MCP prompts use the **+** menu on Desktop.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `/` shows only built-in prompts | Expected on Claude Desktop | Use **+ → Add from mcp-from-scratch-prompts** |
| Hammer shows tools, no prompt picker | Module 06 server or connector not enabled | Use [09-prompts/src/server.js](./server.js); enable in Konnektoren |
| Server fails to start | Bad path, `node` not found | Same as [module 06 connect](../06-tools-call/src/connect.md) |
| No **Add from …** in + menu | Stale session or connector off | Full quit; new chat; enable connector |
| UI asks for fields | Expected - `prompts/get` arguments | Match names from `prompts/list` |
| Empty message after prompt | Server returned no `messages` | Fix resolver in [demo-prompts.js](./demo-prompts.js) |
| Confused with **sampling** | Module 11 - server asks the model | Prompts return templates only |

---

## Common misconceptions

- **“I connected MCP”** ≠ prompts visible. Tools and prompts are separate capabilities.
- **Typing “summarize this”** in chat is not the same as invoking the MCP **`summarize`** prompt template.
- **Module 06 exercises** (echo, add) never show prompts - different [06-tools-call/src/server.js](../../06-tools-call/src/server.js).

---

## Security

Same trust boundary as module 06: anything in `mcpServers` runs as your user. Read [09-prompts/src/server.js](./server.js) before connecting.

---

Back to module README: [`../README.md`](../README.md)

Tools-only Desktop setup: [module 06 connect.md](../../06-tools-call/src/connect.md)

Module 09 prompts in Desktop/Cursor: **this hub**
