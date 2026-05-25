# Connect MCP prompts - macOS (Claude Desktop)

Step-by-step instructions for wiring **module 09** prompts to Claude Desktop on a Mac. You need Node.js 20+, Claude Desktop installed, and this repo cloned locally.

Overview: [`connect-prompts.md`](./connect-prompts.md)

---

## 1. Confirm the prompts server runs

In Terminal, from the repo root:

```bash
cd /path/to/mcp-from-scratch
node --version
node 09-prompts/src/client.js
```

You should see three prompts listed and successful `prompts/get` output. If not, fix the server before continuing.

Optional smoke-test:

```bash
node 09-prompts/src/server.js
```

Press **Ctrl+C** to stop.

---

## 2. Get the absolute path to [server.js](./server.js)

```bash
cd /path/to/mcp-from-scratch
echo "$(pwd)/09-prompts/src/server.js"
```

Copy the printed path - you will paste it into `claude_desktop_config.json`.

Confirm Node is on your PATH:

```bash
which node
```

---

## 3. Locate `claude_desktop_config.json`

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Create if missing:

```bash
mkdir -p ~/Library/Application\ Support/Claude
echo '{"mcpServers":{}}' > ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

---

## 4. Edit the config

Open the file in your editor. Add (or merge) this entry under `mcpServers`:

```json
{
  "mcpServers": {
    "mcp-from-scratch-prompts": {
      "command": "node",
      "args": [
        "/Users/you/Playground/mcp-from-scratch/09-prompts/src/server.js"
      ]
    }
  }
}
```

Replace `/Users/you/Playground/mcp-from-scratch` with **your** path from step 2.

**Important:** Do not paste the tutorial placeholder `/Users/you/...` literally. Claude Desktop will show the connector as connected briefly, then the server crashes with `Cannot find module` in the log. Use your real absolute path from step 2.

If you already have `"mcp-from-scratch"` from module 06 (tools), **keep it** - add `"mcp-from-scratch-prompts"` as a second key.

Validate JSON:

```bash
python3 -m json.tool ~/Library/Application\ Support/Claude/claude_desktop_config.json > /dev/null \
  && echo "JSON OK" || echo "JSON invalid"
```

---

## 5. Restart Claude Desktop

1. **Quit** completely (**Claude → Quit Claude**, or **Cmd+Q**). Do not just close the window.
2. Reopen Claude.
3. Open a **new** chat. Old chats opened while the server was failing or reconnecting will not pick up prompts.

---

## 6. Enable the prompts connector in this chat

Claude Desktop only lists MCP servers in **Konnektoren** (Connectors) when they expose at least one **tool**. The module 09 server includes a `list_prompt_templates` tool for that reason - without it, the server connects in Developer settings but never appears in the per-chat connector toggle.

Seeing the connector in Settings does not automatically enable it for a conversation. Enable it **per chat**:

1. Click **`+`** in the chat input (or type **`/`**).
2. Hover **Connectors** (Konnektoren).
3. Find **`mcp-from-scratch-prompts`** and toggle it **on** for this chat.

You should have two separate entries if module 06 is also configured:

| Connector | Capability | UI |
|-----------|------------|-----|
| `mcp-from-scratch` | tools | Hammer icon |
| `mcp-from-scratch-prompts` | tools + prompts | Hammer + **+ menu** prompt templates |

Also check **Settings → Developer** (Desktop app) that **`mcp-from-scratch-prompts`** shows connected.

---

## 7. Find prompts in the UI

Claude Desktop does **not** list MCP prompt templates in the **`/`** slash menu. That menu is for built-in commands and skills only. Prompt templates live under the **`+`** attachment menu.

This is different from module 06 **tools** (hammer icon) and different from **Claude Code** (which uses `/mcp__<server>__<prompt>`).

1. Click **`+`** next to the message box (do **not** type `/`).
2. Select **Add from mcp-from-scratch-prompts** (wording may vary by Desktop version or locale).
3. Pick **`summarize`**, **`code_review`**, or **`explain_concept`**.
4. Fill in any requested arguments, then click **Add prompt**.
5. The template appears as an attachment chip in the composer - send when ready.

Menu labels change between Desktop versions. If you do not see **Add from …**, confirm the connector is enabled in step 6 and try a new chat after a full quit.

---

## 8. Hands-on verify - `summarize`

1. Click **`+`** → **Add from mcp-from-scratch-prompts** → **`summarize`**.
2. When prompted for **`text`**, paste:

   `MCP prompts return messages, not tool results.`

3. Click **Add prompt**, then send the message.

**Expected:** The chat contains a **user message** asking to summarize that text - not an echo **tool** result from module 06.

---

## 9. Second verify - `code_review`

1. Click **`+`** → **Add from mcp-from-scratch-prompts** → **`code_review`**.
2. Paste sample code when asked:

   ```python
   def hello():
       print('world')
   ```

3. Click **Add prompt**, then send.

**Expected:** A user message asking the model to review the code.

---

## 10. Read logs

```bash
ls -lt ~/Library/Logs/Claude/mcp-server-*.log | head
tail -f ~/Library/Logs/Claude/mcp-server-mcp-from-scratch-prompts.log
```

At startup you should see `tools/list` return `list_prompt_templates` and `prompts/list` return three prompts. After you add a prompt via the **+** menu, look for **`prompts/get`** in the log.

---

## 11. macOS troubleshooting

| Symptom | What to do |
|---------|------------|
| `/` shows only built-in prompts | Expected on Desktop - use **+ → Add from mcp-from-scratch-prompts** instead |
| Connector visible in Developer settings but missing from Konnektoren | Prompts-only servers are hidden - module 09 includes `list_prompt_templates` so Desktop shows the connector |
| Only tools (hammer), no prompt picker | Enable **`mcp-from-scratch-prompts`** in Konnektoren; config still points at [06-tools-call/src/server.js](../../06-tools-call/src/server.js) for tools only |
| `Cannot find module '/Users/you/...'` in log | Replace tutorial placeholder path with your real absolute path |
| Server not in settings | Wrong JSON path; check `python3 -m json.tool` |
| `node: command not found` | Set `"command"` to full path from `which node` |
| No **Add from …** in + menu | Full quit + new chat; enable connector in step 6; run `node 09-prompts/src/client.js` first |
| Empty message after prompt | Read log; check server returns `messages` |

---

## 12. Exercise

Add a fourth prompt in [09-prompts/src/demo-prompts.js](./demo-prompts.js), restart Desktop, confirm it appears under **+ → Add from mcp-from-scratch-prompts**.

---

Back to hub: [`connect-prompts.md`](./connect-prompts.md)

Cursor: [`connect-cursor.md`](./connect-cursor.md)
