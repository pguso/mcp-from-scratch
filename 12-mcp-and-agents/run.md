# run.md - Module 12

## Prerequisites

- Node.js 20 or later
- Run from the project root (`mcp-from-scratch/`)
- Modules 02–06 present (the agent loop spawns [06-tools-call/src/server.js](../06-tools-call/src/server.js))

---

## 1. Custom agent loop (local `node-llama-cpp` model)

```bash
npm install --prefix 12-mcp-and-agents
node 12-mcp-and-agents/src/agent-loop.js
```

On the first run, `node-llama-cpp` may download the GGUF model into the shared top-level `models/` directory, so startup can take a while. Later runs in module 11 or module 12 reuse that same file instead of downloading another copy.

Expected output shape:

```
[agent] MCP agent loop (local LLM: unsloth/Qwen3.5-2B-GGUF)

[agent] user goal: What can you do with the echo tool?

[llm] resolving model: ...
[llm] models directory: ...
[llm] model ready: unsloth/Qwen3.5-2B-GGUF

[agent] plan → tools/list
[agent] discovered 3 tool(s):
  • echo: Returns the message you send, unchanged.
  • get_time: Returns the server clock as an ISO-8601 timestamp.
  • add: Adds two numbers and returns the sum.

[agent] plan → local LLM chooses tool
[agent] model wants: echo({"message":"Agent echo: What can you do with the echo tool?"})

[agent] act → tools/call
[agent] tool result (isError=false):
  Agent echo: What can you do with the echo tool?

[agent] observe → local LLM final answer
[agent] reply to user:
The echo tool returns exactly the message you send it. In this run it echoed:
Agent echo: What can you do with the echo tool?

[agent] closing MCP session
[agent] disposing local LLM
```

What to check:

- Handshake completes silently inside `createMcpSession` (no error before `tools/list`).
- Three tools are discovered from the module 06 server.
- The local LLM selects a plausible tool call for the user goal.
- `tools/call` returns the echoed text in a `text` content block.
- The final answer is grounded in the tool output.
- Process exits cleanly.

---

## 2. LangChain example (optional, requires npm + API key)

See [`langchain-example/README.md`](./langchain-example/README.md).

```bash
cd 12-mcp-and-agents/langchain-example
npm install
cp .env.example .env
# Edit .env and set OPENAI_API_KEY
npm start
```

---

## Troubleshooting

**`Cannot find module '../../06-tools-call/...'`** - run from the project root; module 06 must exist.

**`Cannot find module '../../03-stdio-transport/...'`** - modules 02–04 must exist; the session imports shared protocol code.

**Model download / load takes a long time** - the first run may need to download a GGUF and initialize `node-llama-cpp`. Later runs should be faster.

**Empty tool list** - you may be pointing at [05-tools-list/src/server.js](../05-tools-list/src/server.js), which lists tools but does not implement `tools/call` the same way; use module 06’s server (the default in [src/mcp-session.js](./src/mcp-session.js)).

**LangChain example fails to connect** - use absolute paths in `agent.mjs` (the example resolves the module 06 server path automatically); ensure `node` is on your PATH.
