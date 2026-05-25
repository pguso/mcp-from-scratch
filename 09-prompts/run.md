# run.md - Module 09

## Prerequisites

Node.js 20 or later. Run from the project root (`mcp-from-scratch/`). Modules 02–07 must be present (this module imports their code).

---

## 1. Run the prompts demo

The client spawns the server, completes the handshake, lists prompts, fetches each one, then exercises error paths.

```bash
node 09-prompts/src/client.js
```

Expected output (wording must match; truncated preview text may end with `…`):

```
[client] starting MCP handshake

prompts/list before init → rejected (expected): Server not initialized: send initialize first
initialize → server: mcp-from-scratch-prompts
  prompts capability: {"listChanged":true}

[client] handshake complete, session state: READY
--- prompt discovery ---


[client] prompts/list → 3 prompt(s)

  • code_review
    title:       Request code review
    description: Ask the model to review code quality and suggest improvements.
    arguments:
      - code (required): Source code to review

  • explain_concept
    title:       Explain an MCP concept
    description: Explain a core MCP idea in plain language for a beginner.
    arguments:
      - topic (optional): Concept to explain (defaults to "prompts")

  • summarize
    title:       Summarize text
    description: Summarize the given text in a few sentences.
    arguments:
      - text (required): Text to summarize

--- fetch each prompt ---

  prompts/get → summarize
    description: Summarize the given text
    role: user
    text: Summarize the following in 2–3 sentences: MCP prompts return messages, not tool results.

  prompts/get → code_review
    description: Code review prompt
    role: user
    text: Please review this code for clarity, bugs, and improvements: def hello(): print('world')

  prompts/get → explain_concept (default topic)
    description: Explain prompts
    role: user
    text: Explain "prompts" in the Model Context Protocol for someone who just finished building tools and resources. Keep it unde…

--- get errors ---

  unknown name → Invalid params (-32602)
    JSON-RPC error code:    -32602
    JSON-RPC error message: Unknown prompt: does_not_exist

  missing required text → Invalid params (-32602)
    JSON-RPC error code:    -32602
    JSON-RPC error message: Invalid params: missing required argument "text"

[client] done, closing connection
```

What to check:

- `prompts/list` before initialize is rejected - same lifecycle rules as tools and resources.
- After handshake, `prompts/list` returns three prompts sorted by name.
- `prompts/get` returns `messages` with `role` and `content.type: text`.
- Unknown prompt name returns `-32602`.
- Missing required argument returns `-32602`.
- The process exits cleanly.

---

## 2. Drive the server manually

```bash
node 09-prompts/src/server.js
```

**Initialize:**

```
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"manual","version":"1.0.0"}}}
```

**Send initialized:**

```
{"jsonrpc":"2.0","method":"notifications/initialized"}
```

**List prompts:**

```
{"jsonrpc":"2.0","id":2,"method":"prompts/list","params":{}}
```

You should get a `result` with a `prompts` array containing `code_review`, `explain_concept`, and `summarize`.

**Get one prompt:**

```
{"jsonrpc":"2.0","id":3,"method":"prompts/get","params":{"name":"summarize","arguments":{"text":"Hello MCP"}}}
```

You should get `result.messages[0].content.text` containing the summarize template.

**Unknown prompt:**

```
{"jsonrpc":"2.0","id":4,"method":"prompts/get","params":{"name":"missing","arguments":{}}}
```

You should get `error.code: -32602`.

Press `Ctrl-D` to send EOF and exit.

---

## 3. MCP Inspector (optional)

```bash
npx -y @modelcontextprotocol/inspector node /ABSOLUTE/PATH/TO/mcp-from-scratch/09-prompts/src/server.js
```

The browser will say **"Connect to an MCP server to start inspecting"** until you connect.

**Follow [`src/inspector.md`](./src/inspector.md)** step by step (token URL → STDIO → **Connect** → Prompts → `summarize` / `code_review`).

---

## 4. Optional: connect to Claude Desktop or Cursor

After the client demo works, wire this server to a real host so you can invoke prompts from the `/` menu:

- Overview: [`src/connect-prompts.md`](./src/connect-prompts.md)
- macOS: [`src/connect-prompts-macos.md`](./src/connect-prompts-macos.md)
- Windows: [`src/connect-prompts-windows.md`](./src/connect-prompts-windows.md)
- Linux: [`src/connect-prompts-linux.md`](./src/connect-prompts-linux.md)
- Cursor: [`src/connect-cursor.md`](./src/connect-cursor.md)

---

## Troubleshooting

**`Error: Cannot find module '../../07-errors/...'`** - run from the project root. Earlier modules must exist alongside `09-prompts`.

**`prompts/list` returns Method not found** - you are running the wrong [server.js](./src/server.js). Use [09-prompts/src/server.js](./src/server.js).

**Empty `prompts` array** - registration failed at startup; check for validation errors in [src/registry.js](./src/registry.js).

**`prompts/get` succeeds for unknown names** - the handler must throw `-32602` before calling a resolver.

**`prompts/list` rejected after initialize** - you forgot `notifications/initialized`. Send it before listing prompts.

**Desktop shows tools but no prompt templates** - you connected the module 06 tools server, or you looked in the **`/`** menu. Point config at [09-prompts/src/server.js](./src/server.js), enable the connector, then use **+ → Add from mcp-from-scratch-prompts** (see connect guides).
