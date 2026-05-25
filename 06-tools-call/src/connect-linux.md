# Connect to Claude Desktop - Linux

Step-by-step instructions for wiring **module 06** to Claude Desktop on Linux. You need Node.js 20+, Claude Desktop installed, and this repo cloned locally.

Paths match the usual XDG layout. If your distro packages Claude differently, search for `claude_desktop_config.json` under your home directory.

---

## 1. Confirm the server runs

In a terminal, from the repo root:

```bash
cd /path/to/mcp-from-scratch
node --version
```

You should see `v20` or higher.

Smoke-test the server (optional):

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

Your server path is:

```text
/paste/pwd/here/06-tools-call/src/server.js
```

One-liner to copy:

```bash
cd /path/to/mcp-from-scratch
echo "$(pwd)/06-tools-call/src/server.js"
```

Confirm Node is available:

```bash
which node
```

If `which node` prints nothing, install Node 20+ (nvm, distro package, or nodesource) before continuing.

---

## 3. Locate the Claude Desktop config file

Default location:

```text
~/.config/Claude/claude_desktop_config.json
```

Check that the file exists:

```bash
ls ~/.config/Claude/claude_desktop_config.json
```

- If the path is listed, continue to step 4.
- If not, create the directory and an empty config:

```bash
mkdir -p ~/.config/Claude
echo '{}' > ~/.config/Claude/claude_desktop_config.json
```

If that path does not exist on your system, search:

```bash
find ~ -name 'claude_desktop_config.json' 2>/dev/null
```

Optional backup:

```bash
cp ~/.config/Claude/claude_desktop_config.json \
   ~/.config/Claude/claude_desktop_config.json.bak
```

---

## 4. Edit `claude_desktop_config.json`

Open the file:

```bash
# nano (simple)
nano ~/.config/Claude/claude_desktop_config.json

# vi
vi ~/.config/Claude/claude_desktop_config.json

# GUI editor
xdg-open ~/.config/Claude/claude_desktop_config.json
```

Replace `/home/you/Playground/mcp-from-scratch` with **your** path from step 2.

### Fresh config (only this server)

```json
{
  "mcpServers": {
    "mcp-from-scratch": {
      "command": "node",
      "args": [
        "/home/you/Playground/mcp-from-scratch/06-tools-call/src/server.js"
      ]
    }
  }
}
```

### You already have other MCP servers

Add `"mcp-from-scratch": { ... }` inside the existing `"mcpServers"` object without removing other entries.

Validate JSON (optional):

```bash
python3 -m json.tool ~/.config/Claude/claude_desktop_config.json > /dev/null \
  && echo "JSON OK" || echo "JSON invalid - fix commas/quotes"
```

---

## 5. If `node` is not on Claude’s PATH

Desktop apps often start with a minimal environment (no nvm in PATH). Use the full path from `which node` after you have activated the same Node you use in the terminal, **or** install Node system-wide.

```json
"mcp-from-scratch": {
  "command": "/home/you/.nvm/versions/node/v22.0.0/bin/node",
  "args": [
    "/home/you/Playground/mcp-from-scratch/06-tools-call/src/server.js"
  ]
}
```

If you use **nvm**, prefer a system-wide Node for Claude, or set `"command"` to the absolute `node` binary nvm selected when you ran `which node`.

---

## 6. Restart Claude Desktop

MCP servers load only at startup.

1. Fully **quit** Claude Desktop (tray icon → Quit, or close all windows and confirm the process ended).
2. Check no stray process:

```bash
pgrep -a -i claude
```

3. Start Claude again from your application menu or launcher.
4. Open a **new** chat and check for MCP tools (see [connect.md](./connect.md#verify-in-the-ui-all-platforms)).

---

## 7. Read logs when something fails

Log location can vary by build. Check these in order:

```bash
ls ~/.config/Claude/logs/mcp-server-*.log 2>/dev/null
ls ~/.local/share/Claude/logs/mcp-server-*.log 2>/dev/null
```

Your server log is often named:

```text
mcp-server-mcp-from-scratch.log
```

Tail it:

```bash
tail -f ~/.config/Claude/logs/mcp-server-mcp-from-scratch.log
```

If neither directory exists, search:

```bash
find ~/.config ~/.local/share -name 'mcp-server-*.log' 2>/dev/null
```

---

## 8. Linux troubleshooting

| Symptom | What to do |
|---------|------------|
| Server does not appear | Wrong path in `args`; `ls -l` the exact path in JSON |
| `~` in JSON does not work | Use full path from `echo "$(pwd)/06-tools-call/src/server.js"` |
| `node: command not found` | Set `"command"` to absolute path; nvm often is not in Desktop’s PATH |
| Tools list empty | Read `mcp-server-mcp-from-scratch.log` for stderr on spawn |
| Permission denied | `chmod +r` on [server.js](./server.js); ensure repo is on a filesystem Desktop can read |
| AppImage / sandbox | Some builds restrict subprocesses; check Claude release notes for your distro |

---

## 9. Quick verification prompt

In a new Claude chat:

> Use the echo tool with message "connected from Linux"

You should see a tool call and the echoed text.

Back to the overview: [`connect.md`](./connect.md)
