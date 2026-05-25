# Connect MCP prompts - Linux (Claude Desktop)

Step-by-step instructions for wiring **module 09** prompts to Claude Desktop on Linux.

Overview: [`connect-prompts.md`](./connect-prompts.md)

---

## 1. Confirm the prompts server runs

```bash
cd /path/to/mcp-from-scratch
node --version
node 09-prompts/src/client.js
```

---

## 2. Get the absolute path to [server.js](./server.js)

```bash
cd /path/to/mcp-from-scratch
echo "$(pwd)/09-prompts/src/server.js"
```

Do not use `~` in the JSON file.

---

## 3. Locate `claude_desktop_config.json`

```text
~/.config/Claude/claude_desktop_config.json
```

Create if missing:

```bash
mkdir -p ~/.config/Claude
echo '{"mcpServers":{}}' > ~/.config/Claude/claude_desktop_config.json
```

---

## 4. Edit the config

```json
{
  "mcpServers": {
    "mcp-from-scratch-prompts": {
      "command": "node",
      "args": [
        "/home/you/Playground/mcp-from-scratch/09-prompts/src/server.js"
      ]
    }
  }
}
```

---

## 5. Restart Claude Desktop

Quit completely. Reopen. New chat.

---

## 6. Enable the connector and find prompts

Enable **`mcp-from-scratch-prompts`** per chat: **+** → **Connectors** → toggle on.

Claude Desktop does **not** list MCP prompts in the **`/`** menu. Use the **+** attachment menu:

1. Click **`+`** next to the message box.
2. Select **Add from mcp-from-scratch-prompts**.
3. Pick **`summarize`**, **`code_review`**, or **`explain_concept`**.

Settings → Developer - confirm server connected.

---

## 7. Verify - `summarize`

Click **`+`** → **Add from mcp-from-scratch-prompts** → **`summarize`**, enter text `MCP prompts return messages, not tool results.`, click **Add prompt**, send.

**Expected:** Templated user message - not a tool echo.

---

## 8. Logs

```bash
tail -f ~/.config/Claude/logs/mcp-server-mcp-from-scratch-prompts.log
```

Or:

```bash
tail -f ~/.local/share/Claude/logs/mcp-server-mcp-from-scratch-prompts.log
```

(Path varies by package - search `mcp-server*.log` under your home if needed.)

---

## 9. Linux troubleshooting

| Symptom | What to do |
|---------|------------|
| `/` shows only built-in prompts | Expected - use **+ → Add from mcp-from-scratch-prompts** |
| Tools only | Config points at module 06 - switch to `09-prompts` |
| Spawn fails | `which node` → use full path in `"command"` |
| No **Add from …** in + menu | Run [client.js](./client.js); full quit Desktop; enable connector |

---

Back to hub: [`connect-prompts.md`](./connect-prompts.md)
