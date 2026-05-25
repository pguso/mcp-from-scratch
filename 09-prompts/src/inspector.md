# MCP Inspector

The [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) is an optional browser UI for testing and debugging your server. You do not need Claude Desktop or Cursor to use it.

**The MCP Inspector cannot show a host's calls to your MCP server.** Inspector's History tab only records traffic from *its own* browser session. Claude Desktop, Cursor, and other hosts spawn a separate server process that Inspector never sees.

Used by [`run.md`](../run.md) (optional step 3) before wiring a real host.

---

## Inspector cannot show host MCP calls

Inspector is great for *you* clicking prompts in the browser. It is **not** a spy tool for Claude Desktop or Cursor.

| You might expect | Reality |
|------------------|---------|
| Inspector is running `server.js`, so the host's calls appear in History | The host starts its **own** `node server.js` - Inspector has no pipe into it |
| Point the host at `localhost:6274` to use Inspector | That URL is for the **browser UI only**, not an MCP host endpoint |
| Inspector and a host share one server because both use stdio | Stdio means one client **owns** one process - they cannot share |

If you need to see JSON-RPC from Claude Desktop or Cursor, use host logs (see [How to see host MCP calls](#how-to-see-host-mcp-calls)) - Inspector is not an option there.

---

## Before you start

1. [`run.md`](../run.md) section 1 passes (`node 09-prompts/src/client.js`).
2. You have an **absolute** path to [server.js](./server.js) (no `~` in JSON config files):

```bash
# macOS / Linux
echo "$(pwd)/09-prompts/src/server.js"

# Windows PowerShell
(Resolve-Path .\09-prompts\src\server.js).Path
```

Stdio servers must be **spawned** by Inspector (same as [`client.js`](./client.js)). Do not run `node server.js` in one terminal and connect to `localhost` in the browser.

---

## Launch Inspector

From the repo root:

```bash
npx -y @modelcontextprotocol/inspector node /ABSOLUTE/PATH/TO/mcp-from-scratch/09-prompts/src/server.js
```

**Keep this terminal open.** Closing it stops the proxy and the UI will disconnect.

---

## Connect in the browser

The page says **"Connect to an MCP server to start inspecting"** until you connect - that is expected. Three steps: **open the right URL → fill Server Connection → click Connect**.

### Step 1 - Open the URL printed in the terminal

After startup, the terminal prints lines like:

```
🔑 Session token: abc123…
🔗 Open inspector with token pre-filled:
   http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=abc123…
```

| Do | Don't |
|----|--------|
| Click or copy **that full URL** (includes `MCP_PROXY_AUTH_TOKEN=…`) | Type only `http://localhost:6274` from memory |

Recent Inspector versions require this token so the browser can talk to the local proxy. Without it, the page may load but never connect properly.

**Already opened the bare URL?**

1. In the Inspector sidebar, click **Configuration**.
2. Find **Proxy Session Token**.
3. Paste the token from the terminal (`🔑 Session token:` line).
4. Click **Save**, then continue to Step 2.

### Step 2 - Fill in Server Connection (sidebar)

On the connect screen, find the **Connect** panel on the left.

![connect](../../images/inspector-connect.png)

Set these values for this course:

| Field | Value |
|-------|--------|
| **Transport type** | `STDIO` |
| **Command** | `node` |
| **Arguments** | `/ABSOLUTE/PATH/TO/mcp-from-scratch/09-prompts/src/server.js` |

![arguments](../../images/inspector-values.png)

Notes:

- If you launched Inspector with `node …/server.js` on the command line, **Command** and **Arguments** may already be filled - check them, then continue.
- Use an **absolute** path (no `~`).
- This module uses **stdio** only. Do not choose SSE or Streamable HTTP unless you built an HTTP server.

Click **Connect**.

### Step 3 - List prompts on the Prompts tab

1. Open **Prompts** in the top toolbar and click **List Prompts**.
2. You should see three prompts: `code_review`, `explain_concept`, `summarize` (same as [`client.js`](./client.js)).
3. Each entry shows `title`, `description`, and `arguments` - the same metadata `prompts/list` returns to any host.

**Expected:** Three prompts sorted by name, with required/optional argument labels.

### Step 4 - Get `summarize`

1. Select **`summarize`**.
2. Fill the arguments field:

```json
{
  "text": "MCP prompts return messages, not tool results."
}
```

3. Click **Get Prompt** (label may vary by Inspector version).
4. Read the **Prompt Result**.

**Expected:** A `messages` array with one user message whose text starts with `Summarize the following in 2–3 sentences:` and includes your `text` value. This is the same payload a host injects into chat - not a tool result.

### Step 5 - Get `code_review`

1. Select **`code_review`**.
2. Provide **`code`** with:

```json
{
  "code": "def hello():\n    print('world')"
}
```

Or paste a multi-line block if the Inspector UI supports a textarea for the `code` argument:

```python
def hello():
    print('world')
```

3. Click **Get Prompt**.

**Expected:** A user message asking to review the code, containing your source in the template body.

### Step 6 - Confirm in History (optional)

Open **History** (or the message log). You should see JSON-RPC traffic, including:

1. `initialize` request and response
2. `notifications/initialized`
3. `prompts/list`
4. `prompts/get` for each prompt you fetched

That is the same lifecycle as [`run.md`](../run.md) section 1. This History is **only** from your browser session - not from Claude Desktop or Cursor.

---

## Go further (optional)

| Prompt | Arguments | Expected |
|--------|-----------|----------|
| `explain_concept` | `{}` (default topic) | User message explaining `"prompts"` |
| `explain_concept` | `{ "topic": "resources" }` | User message explaining `"resources"` |
| Unknown name | name `does_not_exist` | JSON-RPC error `-32602` |
| Missing required arg | `summarize` with `{}` | JSON-RPC error `-32602` |

Manual JSON (no browser): [`run.md`](../run.md) section 2.

---

## While editing [server.js](./server.js)

1. Change the server or [demo-prompts.js](./demo-prompts.js).
2. **Reconnect** in Inspector (or stop and re-run the `npx` command).
3. Prompts tab → **List Prompts** → fetch one prompt.

Debug logs: `console.error` only - never `console.log` on stdout (corrupts the protocol stream).

| Change | Action |
|--------|--------|
| [server.js](./server.js) or resolver code | Reconnect Inspector; test one prompt |
| Host config (Desktop / Cursor) | Full quit + reopen host; new chat |
| Prompt missing in host UI | [`connect-prompts.md`](./connect-prompts.md) - connector, **+** menu, new chat |

---

## After Inspector works → wire a host

Inspector proves the server works. Claude Desktop and Cursor are wired **separately** to the same file - not through Inspector.

1. **[`connect-prompts.md`](./connect-prompts.md)** - overview and shared JSON
2. **Your OS / editor** - [macOS](./connect-prompts-macos.md) · [Windows](./connect-prompts-windows.md) · [Linux](./connect-prompts-linux.md) · [Cursor](./connect-cursor.md)

Same path in config:

```json
"args": ["/ABSOLUTE/PATH/TO/mcp-from-scratch/09-prompts/src/server.js"]
```

Quit the host completely → reopen → **new chat**.

**Export from Inspector (optional):** After connecting in the browser, use the **Server Entry** or **Servers File** buttons in the Inspector UI to copy launch config into host MCP settings. This copies the same `command`/`args` - it does **not** route the host's traffic through Inspector.

---

## How to see host MCP calls

**Inspector cannot do this.** Use one of these instead:

### Desktop logs (Claude Desktop)

Claude writes MCP subprocess logs on every OS. Example on macOS:

```text
~/Library/Logs/Claude/mcp-server-mcp-from-scratch-prompts.log
```

Tail while reproducing an issue:

```bash
tail -f ~/Library/Logs/Claude/mcp-server-mcp-from-scratch-prompts.log
```

Log paths for other OSes are in the [connect guides](./connect-prompts.md). Look for `initialize`, `prompts/list`, and `prompts/get`.

### stdio wrapper (optional, advanced)

To print a host's JSON-RPC to a terminal or file, wrap the server in [`mcp-snoop`](https://github.com/0-co/mcp-snoop):

```json
{
  "mcpServers": {
    "mcp-from-scratch-prompts": {
      "command": "npx",
      "args": [
        "-y", "mcp-snoop", "--verbose", "--",
        "node", "/ABSOLUTE/PATH/TO/mcp-from-scratch/09-prompts/src/server.js"
      ]
    }
  }
}
```

This is optional debugging - not required for the course.

---

## Troubleshooting

| What you see | What to do |
|--------------|------------|
| Page loads, still says "Connect to an MCP server…" | Complete connect steps: STDIO + **Connect** |
| Blank page or proxy errors | Use the terminal URL with `MCP_PROXY_AUTH_TOKEN` |
| Connect then instant disconnect | Terminal stack trace; verify path points to **09** [server.js](./server.js) |
| Connected, Prompts tab empty | Reconnect; check History for failed `initialize` |
| Garbled / hung session | No `console.log` on server stdout - use stderr only |
| Inspector works, host does not | Match absolute path; no `~`; full quit; new chat; host MCP logs |
| Only tools, no prompts in host | Wrong server - use **09** [server.js](./server.js), not module 06 |
| Host's calls missing from Inspector History | Expected - see [Inspector cannot show host MCP calls](#inspector-cannot-show-host-mcp-calls) |

---

## Official links

- [Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
- [Prompts spec](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts)
- [Debugging](https://modelcontextprotocol.io/docs/tools/debugging)
