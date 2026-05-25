# Connect to Claude Desktop - macOS

Step-by-step instructions for wiring **module 06** to Claude Desktop on a Mac. You need Node.js 20+, Claude Desktop installed, and this repo cloned locally.

---

## 1. Confirm the server runs

In Terminal, from the repo root:

```bash
cd /path/to/mcp-from-scratch
node --version
```

You should see `v20` or higher.

Smoke-test the server (optional but recommended):

```bash
node 06-tools-call/src/server.js
```

It should sit quietly on stdin with no errors. Press **Ctrl+C** to stop.

---

## 2. Get the absolute path to [server.js](./server.js)

Claude’s config file requires a full path, not `~`.

```bash
cd /path/to/mcp-from-scratch
pwd
```

Note the printed directory, then your server path is:

```text
/paste/pwd/here/06-tools-call/src/server.js
```

Or print it in one command:

```bash
cd /path/to/mcp-from-scratch
echo "$(pwd)/06-tools-call/src/server.js"
```

Copy that line - you will paste it into `claude_desktop_config.json`.

Confirm Node is on your PATH (Claude inherits a limited PATH):

```bash
which node
```

Example output: `/usr/local/bin/node` or `/opt/homebrew/bin/node`. If `which node` fails, install Node 20+ before continuing.

---

## 3. Locate the Claude Desktop config file

Default location:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Check that the file (or folder) exists:

```bash
ls ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

- If you see the path printed, the file exists - go to step 4.
- If you see `No such file or directory`, create the directory and an empty config:

```bash
mkdir -p ~/Library/Application\ Support/Claude
echo '{}' > ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

Optional backup before editing:

```bash
cp ~/Library/Application\ Support/Claude/claude_desktop_config.json \
   ~/Library/Application\ Support/Claude/claude_desktop_config.json.bak
```

---

## 4. Edit `claude_desktop_config.json`

Open the file in your editor. Examples:

```bash
# Terminal (vi)
vi ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Terminal (nano - easier if you are new to vi)
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json

# GUI editor
open -a "Visual Studio Code" ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

Replace `/Users/you/Playground/mcp-from-scratch` with **your** repo path from step 2.

### Fresh config (only this server)

```json
{
  "mcpServers": {
    "mcp-from-scratch": {
      "command": "node",
      "args": [
        "/Users/you/Playground/mcp-from-scratch/06-tools-call/src/server.js"
      ]
    }
  }
}
```

### You already have other MCP servers

Add `"mcp-from-scratch": { ... }` inside the existing `"mcpServers"` object. Do not remove other keys.

Example with two servers:

```json
{
  "mcpServers": {
    "some-other-server": {
      "command": "npx",
      "args": ["-y", "some-package"]
    },
    "mcp-from-scratch": {
      "command": "node",
      "args": [
        "/Users/you/Playground/mcp-from-scratch/06-tools-call/src/server.js"
      ]
    }
  }
}
```

Validate JSON (optional):

```bash
python3 -m json.tool ~/Library/Application\ Support/Claude/claude_desktop_config.json > /dev/null \
  && echo "JSON OK" || echo "JSON invalid - fix commas/quotes"
```

---

## 5. If `node` is not on Claude’s PATH

If logs show `node: command not found`, set `command` to the full path from `which node`:

```json
"mcp-from-scratch": {
  "command": "/opt/homebrew/bin/node",
  "args": [
    "/Users/you/Playground/mcp-from-scratch/06-tools-call/src/server.js"
  ]
}
```

---

## 6. Restart Claude Desktop

MCP servers load only at startup.

1. **Quit** Claude Desktop completely (menu **Claude → Quit Claude**, or **Cmd+Q**). Closing the window is not always enough.
2. Reopen Claude from Applications or Spotlight.
3. Open a **new** chat and check for MCP tools (see [connect.md](./connect.md#verify-in-the-ui-all-platforms)).

---

## 7. Read logs when something fails

Claude writes MCP subprocess logs here:

```text
~/Library/Logs/Claude/
```

List recent MCP logs:

```bash
ls -lt ~/Library/Logs/Claude/mcp-server-*.log | head
```

Your server’s log usually matches the config key:

```text
~/Library/Logs/Claude/mcp-server-mcp-from-scratch.log
```

Tail the log while reproducing the issue:

```bash
tail -f ~/Library/Logs/Claude/mcp-server-mcp-from-scratch.log
```

---

## 8. macOS troubleshooting

| Symptom | What to do |
|---------|------------|
| Server does not appear in UI | Wrong path in `args`; run `ls` on the exact path you put in JSON |
| `No such file` in logs | Used `~` in JSON - use full path from `echo "$(pwd)/06-tools-call/src/server.js"` |
| `node: command not found` | Set `"command"` to output of `which node` |
| Tools list empty | Server crashed on start; read `mcp-server-mcp-from-scratch.log` |
| JSON parse error in Desktop | Run `python3 -m json.tool` on the config file; fix trailing commas |
| Permission denied | Ensure [server.js](./server.js) is readable: `chmod +r .../server.js` |

---

## 9. Quick verification prompt

In a new Claude chat:

> Use the echo tool with message "connected from macOS"

You should see a tool call and text echoing your message.

Back to the overview: [`connect.md`](./connect.md)
