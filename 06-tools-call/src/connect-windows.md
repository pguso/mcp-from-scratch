# Connect to Claude Desktop - Windows

Step-by-step instructions for wiring **module 06** to Claude Desktop on Windows. You need Node.js 20+, Claude Desktop installed, and this repo cloned locally.

---

## 1. Confirm the server runs

Open **PowerShell** or **Windows Terminal** and go to the repo:

```powershell
cd C:\path\to\mcp-from-scratch
node --version
```

You should see `v20` or higher.

Smoke-test the server (optional):

```powershell
node 06-tools-call\src\server.js
```

It should sit quietly with no errors. Press **Ctrl+C** to stop.

---

## 2. Get the absolute path to [server.js](./server.js)

Claude’s config requires a full path. In PowerShell:

```powershell
cd C:\path\to\mcp-from-scratch
(Resolve-Path .\06-tools-call\src\server.js).Path
```

Copy the printed path (for example `C:\Users\you\Playground\mcp-from-scratch\06-tools-call\src\server.js`).

In **JSON**, backslashes must be escaped **or** you can use forward slashes (Node accepts both):

```json
"C:\\Users\\you\\Playground\\mcp-from-scratch\\06-tools-call\\src\\server.js"
```

or

```json
"C:/Users/you/Playground/mcp-from-scratch/06-tools-call/src/server.js"
```

Find Node’s location (needed if Desktop cannot find `node`):

```powershell
where.exe node
```

Example: `C:\Program Files\nodejs\node.exe`

---

## 3. Locate the Claude Desktop config file

Default location:

```text
%APPDATA%\Claude\claude_desktop_config.json
```

Which expands to something like:

```text
C:\Users\YourName\AppData\Roaming\Claude\claude_desktop_config.json
```

### Check the file exists (PowerShell)

```powershell
Test-Path "$env:APPDATA\Claude\claude_desktop_config.json"
```

- `True` - file exists; go to step 4.
- `False` - create folder and empty config:

```powershell
New-Item -ItemType Directory -Force -Path "$env:APPDATA\Claude"
Set-Content -Path "$env:APPDATA\Claude\claude_desktop_config.json" -Value '{}'
```

### Open the folder in Explorer

```powershell
explorer "$env:APPDATA\Claude"
```

Optional backup:

```powershell
Copy-Item "$env:APPDATA\Claude\claude_desktop_config.json" `
          "$env:APPDATA\Claude\claude_desktop_config.json.bak"
```

---

## 4. Edit `claude_desktop_config.json`

Open the file in an editor:

```powershell
notepad "$env:APPDATA\Claude\claude_desktop_config.json"
```

Or VS Code:

```powershell
code "$env:APPDATA\Claude\claude_desktop_config.json"
```

Replace the example path with **your** path from step 2.

### Fresh config (only this server)

```json
{
  "mcpServers": {
    "mcp-from-scratch": {
      "command": "node",
      "args": [
        "C:/Users/you/Playground/mcp-from-scratch/06-tools-call/src/server.js"
      ]
    }
  }
}
```

### You already have other MCP servers

Add `"mcp-from-scratch": { ... }` inside the existing `"mcpServers"` object. Keep every other server entry.

Validate JSON (optional, PowerShell 7+):

```powershell
Get-Content "$env:APPDATA\Claude\claude_desktop_config.json" | ConvertFrom-Json
```

If that throws, fix commas or quotes in the file.

---

## 5. If `node` is not on Claude’s PATH

Use the full path from `where.exe node` as `command`:

```json
"mcp-from-scratch": {
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": [
    "C:/Users/you/Playground/mcp-from-scratch/06-tools-call/src/server.js"
  ]
}
```

---

## 6. Restart Claude Desktop

MCP servers load only at startup.

1. Right-click the Claude icon in the **system tray** (if running) and **Quit**, or use **File → Exit** inside the app.
2. Confirm Claude is not still running in Task Manager.
3. Start Claude Desktop again from the Start menu.
4. Open a **new** chat and check for MCP tools (see [connect.md](./connect.md#verify-in-the-ui-all-platforms)).

---

## 7. Read logs when something fails

Logs are under:

```text
%APPDATA%\Claude\logs\
```

PowerShell:

```powershell
Get-ChildItem "$env:APPDATA\Claude\logs\mcp-server-*.log" | Sort-Object LastWriteTime -Descending
```

Your server log is typically:

```text
%APPDATA%\Claude\logs\mcp-server-mcp-from-scratch.log
```

View the tail:

```powershell
Get-Content "$env:APPDATA\Claude\logs\mcp-server-mcp-from-scratch.log" -Tail 50 -Wait
```

---

## 8. Windows troubleshooting

| Symptom | What to do |
|---------|------------|
| Server does not appear | Wrong path in `args`; run `Test-Path` on the exact string in JSON |
| JSON error on startup | Validate with `ConvertFrom-Json`; check for trailing commas |
| `node` not found | Set `"command"` to full path from `where.exe node` |
| Tools list empty | Read `mcp-server-mcp-from-scratch.log` for a crash on spawn |
| Path with spaces | Use forward slashes in JSON; escape backslashes if you use `\` |
| Antivirus blocking | Allow `node.exe` and your repo folder if spawn fails silently |

---

## 9. Quick verification prompt

In a new Claude chat:

> Use the echo tool with message "connected from Windows"

You should see a tool call and the echoed text.

Back to the overview: [`connect.md`](./connect.md)
