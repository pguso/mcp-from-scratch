# Connect MCP prompts - Cursor

Wire **module 09** prompts to Cursor so slash commands / MCP UI expose `summarize`, `code_review`, and `explain_concept`.

Overview: [`connect-prompts.md`](./connect-prompts.md)

Per [Cursor MCP docs](https://cursor.com/docs/context/mcp), **Prompts** are supported (“Templated messages and workflows for users”) - same protocol as Claude Desktop.

---

## 1. Pre-flight

```bash
cd /path/to/mcp-from-scratch
node 09-prompts/src/client.js
```

Confirm three prompts and working `prompts/get`.

---

## 2. Choose config location

| Scope | Path |
|-------|------|
| This project only | `.cursor/mcp.json` in repo root |
| All workspaces | `~/.cursor/mcp.json` |

**UI path:** Command Palette (**Cmd+Shift+P** / **Ctrl+Shift+P**) → search **“MCP”** → **Open MCP Settings** (label may vary).

---

## 3. Add the server

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

Cursor also supports `${workspaceFolder}` in paths:

```json
"args": ["${workspaceFolder}/09-prompts/src/server.js"]
```

Use absolute paths if `${workspaceFolder}` does not resolve on your OS.

---

## 4. Reload Cursor

After saving `.cursor/mcp.json`:

1. **Reload Window** (Command Palette → “Developer: Reload Window”), or
2. Quit and restart Cursor.

Open a **new** chat / agent session.

---

## 5. Find prompts in Cursor

1. Command Palette → **MCP** - confirm **`mcp-from-scratch-prompts`** is listed and enabled.
2. In chat, type **`/`** - search for **`summarize`**, **`code_review`**, **`explain_concept`**.
3. **Tools vs prompts:** Agent tool calls happen automatically during chat; **MCP prompts** are templates **you** pick (same spec as Desktop).

UI labels change between Cursor versions - search by prompt **`name`**, not only by server key.

---

## 6. Verify - `summarize`

1. Invoke **`summarize`** from `/` or MCP prompt UI.
2. Provide **`text`:** `MCP prompts return messages, not tool results.`
3. Send.

**Expected:** Conversation seeded with the summarize template - not module 06 **echo** tool output.

---

## 7. Verify - `code_review`

1. Invoke **`code_review`** from `/` or MCP prompt UI.
2. Provide **`code`:** with:

   ```python
   def hello():
       print('world')
   ```

3. Send.

**Expected:** User message asking for a code review.

---

## 8. Cursor vs Claude Desktop

| Topic | Claude Desktop | Cursor |
|-------|----------------|--------|
| Config | `claude_desktop_config.json` | `.cursor/mcp.json` or `~/.cursor/mcp.json` |
| Tools | Hammer / approval | Agent tool use in chat |
| Prompts | `/` menu | `/`, MCP settings |
| Reload | Full quit | Reload window / restart |
| Module 06 tools | Same stdio pattern | Same stdio pattern |

You can register **both** module 06 (tools) and module 09 (prompts) under different keys.

---

## 9. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Server green, no prompts | Wrong [server.js](./server.js) - must be `09-prompts` |
| Only tools work | Connected module 06 only - add prompts server |
| `/` empty | Reload Cursor; run [client.js](./client.js); check MCP panel |
| “Summarize this” in chat ≠ MCP prompt | Plain chat - use **`/`** MCP prompt |

---

## 10. Not LangChain prompts

Module 12’s LangChain example uses framework **prompt runnables**. MCP **prompts** are protocol templates from **`prompts/get`**. Different layer.

---

Back to hub: [`connect-prompts.md`](./connect-prompts.md)

Desktop macOS: [`connect-prompts-macos.md`](./connect-prompts-macos.md)
