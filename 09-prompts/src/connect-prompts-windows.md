# Connect MCP prompts - Windows (Claude Desktop)

Step-by-step instructions for wiring **module 09** prompts to Claude Desktop on Windows.

Overview: [`connect-prompts.md`](./connect-prompts.md)

---

## 1. Confirm the prompts server runs

```powershell
cd C:\path\to\mcp-from-scratch
node --version
node 09-prompts/src/client.js
```

You should see three prompts and successful `prompts/get` output.

---

## 2. Get the absolute path to [server.js](./server.js)

```powershell
cd C:\path\to\mcp-from-scratch
(Resolve-Path .\09-prompts\src\server.js).Path
```

In JSON use escaped backslashes or forward slashes:

```json
"C:/Users/you/Playground/mcp-from-scratch/09-prompts/src/server.js"
```

---

## 3. Locate `claude_desktop_config.json`

```text
%APPDATA%\Claude\claude_desktop_config.json
```

PowerShell:

```powershell
$env:APPDATA + "\Claude\claude_desktop_config.json"
```

Create if missing:

```powershell
New-Item -ItemType Directory -Force -Path "$env:APPDATA\Claude"
'{"mcpServers":{}}' | Set-Content "$env:APPDATA\Claude\claude_desktop_config.json"
```

---

## 4. Edit the config

Add under `mcpServers`:

```json
{
  "mcpServers": {
    "mcp-from-scratch-prompts": {
      "command": "node",
      "args": [
        "C:/Users/you/Playground/mcp-from-scratch/09-prompts/src/server.js"
      ]
    }
  }
}
```

Keep your module 06 tools entry if you still use it - this is a **second** server key.

---

## 5. Restart Claude Desktop

Quit from the system tray (**Exit**, not just close window). Reopen. Start a **new** chat.

---

## 6. Enable the connector and find prompts

Enable **`mcp-from-scratch-prompts`** per chat: **+** → **Connectors** → toggle on.

Claude Desktop does **not** list MCP prompts in the **`/`** menu. Use the **+** attachment menu instead:

1. Click **`+`** next to the message box.
2. Select **Add from mcp-from-scratch-prompts**.
3. Pick **`summarize`**, **`code_review`**, or **`explain_concept`**.

Check **Settings → Developer** that the server shows connected.

---

## 7. Verify - `summarize`

1. Click **`+`** → **Add from mcp-from-scratch-prompts** → **`summarize`**.
2. Enter text: `MCP prompts return messages, not tool results.`
3. Click **Add prompt**, then send.

**Expected:** Templated user message in chat - not an echo tool call.

---

## 8. Logs

```text
%APPDATA%\Claude\logs\mcp-server-mcp-from-scratch-prompts.log
```

PowerShell:

```powershell
Get-Content "$env:APPDATA\Claude\logs\mcp-server-mcp-from-scratch-prompts.log" -Tail 40 -Wait
```

---

## 9. Windows troubleshooting

| Symptom | What to do |
|---------|------------|
| `/` shows only built-in prompts | Expected - use **+ → Add from mcp-from-scratch-prompts** |
| Tools only, no prompt picker | Wrong server path - must be [09-prompts/src/server.js](./server.js) |
| `node` not found | Use full path from `where.exe node` as `"command"` |
| No **Add from …** in + menu | Full quit; new chat; enable connector; run client.js first |

---

Back to hub: [`connect-prompts.md`](./connect-prompts.md)
