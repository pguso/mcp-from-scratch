# run.md - Module 11

## Prerequisites

Node.js 20 or later. Modules 02–07 must be present (this module imports their code).

Install dependencies and allow ~1.6 GB for the Q6_K model download on first run:

```bash
cd 11-sampling
npm install
```

---

## 1. Run the sampling demo

The client loads the local Qwen model, spawns the server, declares `sampling` in `initialize`, handles `sampling/createMessage` with real inference, and calls `route_support_ticket`.

From [11-sampling/](.):

```bash
npm start
```

Or from the project root:

```bash
node 11-sampling/src/client.js
```

(You must run `npm install` in [11-sampling/](.) first so `node-llama-cpp` resolves.)

Expected flow (exact category label may vary):

```
[client] loading local model (first run may download ~1.5 GB)…

[llm] resolving model: hf:unsloth/Qwen3.5-2B-GGUF:Q6_K
[llm] models directory: …/models
[llm] model ready: unsloth/Qwen3.5-2B-GGUF

[client] starting MCP handshake
…
--- sampling via route_support_ticket ---

[client] request from server: sampling/createMessage
[client] running local model for sampling/createMessage…
[client] sampling/createMessage → assistant text
    text: billing

  tools/call → route_support_ticket
    isError: false
    text:    Category: billing
             Routed to: team-finance
             SLA: 24 hours

--- echo (no sampling) ---

  tools/call → echo
    isError: false
    text:    Sampling demo complete.

[client] done, closing connection
[client] local model disposed
```

What to check:

- Client sends `capabilities.sampling` in `initialize`.
- Server calls `route_support_ticket` only after the handshake is READY.
- Between `tools/call` starting and its result, you see `sampling/createMessage` and a real model response (not the old `teaching client` suffix).
- `route_support_ticket` returns `isError: false` with category, team, and SLA lines.
- `echo` works without any sampling traffic.
- The process exits cleanly and disposes the model.

---

## 2. Drive the server manually

The server still has no npm dependencies:

```bash
node 11-sampling/src/server.js
```

**Initialize (include sampling capability):**

```
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{"sampling":{}},"clientInfo":{"name":"manual","version":"1.0.0"}}}
```

**Send initialized:**

```
{"jsonrpc":"2.0","method":"notifications/initialized"}
```

**Call route_support_ticket (server will write sampling/createMessage to stdout before the tool result):**

```
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"route_support_ticket","arguments":{"message":"Production is down and customers cannot checkout"}}}
```

You should see an outbound line like:

```
{"jsonrpc":"2.0","id":10000,"method":"sampling/createMessage","params":{...}}
```

Reply on stdin with a matching id (any plausible category label):

```
{"jsonrpc":"2.0","id":10000,"result":{"role":"assistant","content":{"type":"text","text":"urgent"},"model":"manual","stopReason":"endTurn"}}
```

Then the `tools/call` response for id `2` arrives on stdout with routing output.

For a real LLM reply without typing JSON by hand, use `npm start` in [11-sampling/](.) instead.

Press `Ctrl-D` to send EOF and exit.

---

## Troubleshooting

**`Cannot find package 'node-llama-cpp'`** - run `npm install` inside [11-sampling/](.).

**`Error: Cannot find module '../../05-tools-list/...'`** - earlier modules must exist alongside `11-sampling`. Imports use paths relative to the repo layout.

**`route_support_ticket` returns isError about sampling capability** - your `initialize` params must include `"sampling": {}` under `capabilities`.

**Server hangs after `tools/call`** - you must answer `sampling/createMessage` on stdin with the same `id` the server used (starts at `10000`).

**Model download fails** - check network access to Hugging Face; set `GGUF_MODEL` to a local `.gguf` path if you downloaded the file yourself.

**Out of memory** - Q6_K needs more RAM than smaller quants; try `GGUF_MODEL=hf:unsloth/Qwen3.5-2B-GGUF:Q4_K_M` or reduce `LLM_CONTEXT_SIZE`.

**Native build errors** - node-llama-cpp may compile from source if no prebuilt binary matches your OS/Node version. Ensure Xcode CLT (macOS) or `build-essential` (Linux) is installed; try `npm rebuild node-llama-cpp`.

**No `sampling/createMessage` line appears** - session must be READY; send `notifications/initialized` first.

**Id collision / wrong response paired** - keep client request ids low (1, 2, 3) and server outbound ids at 10000+ as in this module.
