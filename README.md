# MCP from Scratch

A learning repository for complete beginners. No frameworks. No black boxes. Pure Node.js.

By the end you will have built a working MCP server you can connect to Claude Desktop - and you will understand every line of it.

**Start with [`01-what-is-mcp/README.md`](./01-what-is-mcp/README.md).** That module explains what MCP is, why it exists, and the mental model every later module builds on. 

---

## What you will build

A fully working MCP server in plain Node.js that exposes real tools, follows the protocol exactly, and connects to Claude Desktop (or any MCP client) without modification.

You will build it piece by piece. Each module answers one question. The answer to that question makes the next question obvious.

![learning path](./images/mcp-learning-path.png)

Module 06 is the **tools** milestone. Module 09 adds **prompts** (Desktop / Cursor slash commands). Modules 07–11 complete the protocol. Module 12 connects MCP to **agent workflows** (custom loop + optional LangChain).

---

## Repository structure

```text
mcp-from-scratch/
├── README.md                  ← you are here
├── package.json               ← { "type": "module" } - that is all
├── images/                    ← shared diagrams and screenshots used across modules
├── models/                    ← shared GGUF cache reused by modules 11 and 12
│
├── 01-what-is-mcp/
│   ├── README.md
│   └── ANSWERS.md             ← optional self-check answers; this module is docs-only
│
├── 02-json-rpc/
│   ├── README.md
│   ├── run.md
│   └── src/
│       ├── jsonrpc.js         ← encode and decode messages
│       └── dispatcher.js      ← route method calls to handlers
│
├── 03-stdio-transport/
│   ├── README.md
│   ├── run.md
│   └── src/
│       ├── framing.js         ← buffer stdin, emit complete messages
│       ├── server.js          ← reads from stdin, writes to stdout
│       └── client.js          ← spawns server, sends a message, reads reply
│
├── 04-lifecycle/
│   ├── README.md
│   ├── run.md
│   └── src/
│       ├── session.js         ← state machine: CREATED → INITIALIZING → READY → CLOSED
│       ├── server.js          ← handles initialize, sends initialized notification
│       └── client.js          ← sends initialize, waits for handshake to complete
│
├── 05-tools-list/
│   ├── README.md
│   ├── run.md
│   └── src/
│       ├── registry.js        ← store tool definitions
│       ├── server.js          ← handles tools/list
│       └── client.js          ← calls tools/list, prints what it finds
│
├── 06-tools-call/
│   ├── README.md
│   ├── run.md                 ← pick run-local or run-desktop
│   ├── run-local.md           ← full local checklist
│   ├── run-desktop.md         ← full Desktop checklist
│   └── src/
│       ├── server.js          ← handles tools/call, runs the function, returns result
│       ├── client.js          ← calls a tool, prints the result
│       ├── inspector.md       ← MCP Inspector (launch, connect, Claude Desktop limits)
│       ├── connect.md         ← wire to Claude Desktop (overview)
│       ├── connect-macos.md
│       ├── connect-windows.md
│       └── connect-linux.md
│
├── 07-errors/
│   ├── README.md
│   ├── run.md
│   └── src/
│       ├── errors.js          ← JSON-RPC error codes vs isError tool results
│       ├── server.js
│       └── client.js
│
├── 08-resources/
│   ├── README.md
│   ├── run.md
│   └── src/
│       ├── registry.js        ← store resource definitions + readers
│       ├── server.js          ← handles resources/list and resources/read
│       └── client.js
│
├── 09-prompts/
│   ├── README.md
│   ├── run.md
│   └── src/
│       ├── registry.js        ← prompt definitions + resolvers
│       ├── demo-prompts.js    ← shared registration for tutorial prompts
│       ├── server.js          ← handles prompts/list and prompts/get
│       ├── client.js
│       ├── inspector.md       ← MCP Inspector walkthrough
│       ├── connect-prompts.md ← wire prompts to Desktop / Cursor
│       ├── connect-prompts-macos.md
│       ├── connect-prompts-windows.md
│       ├── connect-prompts-linux.md
│       └── connect-cursor.md
│
├── 10-notifications/
│   ├── README.md
│   ├── run.md
│   └── src/
│       ├── server.js          ← pushes tools/list_changed + resources/list_changed + resources/updated
│       └── client.js          ← listens for server-sent notifications
│
├── 11-sampling/
│   ├── README.md
│   ├── package.json           ← node-llama-cpp for the local sampling client
│   ├── run.md
│   └── src/
│       ├── server.js          ← sends sampling/createMessage to the client
│       ├── llm.js             ← loads GGUF, runs sampling/createMessage
│       └── client.js          ← host: local LLM + MCP client
│
└── 12-mcp-and-agents/
    ├── README.md              ← why MCP for agents; LangChain vs custom loop
    ├── package.json           ← node-llama-cpp for the custom local agent loop
    ├── run.md
    ├── src/
    │   ├── mcp-session.js     ← reusable client: handshake, list, call
    │   ├── tool-schema.js     ← MCP tools → model tool schema
    │   ├── llm.js             ← local GGUF model via node-llama-cpp
    │   └── agent-loop.js      ← plan → act → observe demo
    └── langchain-example/     ← optional; npm deps (@langchain/mcp-adapters)
        ├── README.md
        ├── .env.example
        ├── package.json
        └── agent.mjs
```

One rule: **no npm dependencies** in modules 01–10 (and module 11’s **server**). Every server runs with `node src/server.js`. The only entry in root [package.json](./package.json) is `"type": "module"` to enable ESM imports. If you find yourself reaching for a package, that is a sign the module needs to teach you what the package was hiding.

**Exceptions:**

- [`11-sampling/`](./11-sampling/) - the **client** runs a local GGUF model via `node-llama-cpp` (`npm install` in that folder). The server stays dependency-free.
- [`12-mcp-and-agents/`](./12-mcp-and-agents/) - the custom agent loop also runs a local GGUF model via `node-llama-cpp` (`npm install` in that folder), while keeping the MCP host logic explicit.
- [`12-mcp-and-agents/langchain-example/`](./12-mcp-and-agents/langchain-example/) - optional LangChain + MCP adapters.

Modules 11 and 12 share the repository-level [`models/`](./models/) cache, so once one module downloads the GGUF, the other reuses it. On first run, expect roughly **1.5-1.6 GB** of model files for the default Qwen GGUF.

---

## How each module is organised

Most code modules follow the same three-part pattern:

**README.md** - opens with the question the module answers, explains the concept plainly, shows the relevant raw JSON, and links to the exact spec section at the bottom. Read this first.

**src/** - the implementation. Heavily commented. Every non-obvious decision has a comment explaining why, not just what.

**run.md** - the exact commands to run, and what you should see when it works. If your output does not match, it tells you what to check.

Two important exceptions:

- [`01-what-is-mcp/`](./01-what-is-mcp/) is concept-only: read `README.md`, then use [`ANSWERS.md`](./01-what-is-mcp/ANSWERS.md) as a self-check.
- Modules [`06-tools-call/`](./06-tools-call/), [`09-prompts/`](./09-prompts/), [`11-sampling/`](./11-sampling/), and [`12-mcp-and-agents/`](./12-mcp-and-agents/) include extra connect/install docs beyond the basic `README.md` + `src/` + `run.md` pattern.

Module 06 uses two self-contained run files: [`run-local.md`](./06-tools-call/run-local.md) or [`run-desktop.md`](./06-tools-call/run-desktop.md) - pick one at [`run.md`](./06-tools-call/run.md).

---

## Prerequisites

- Node.js 20 or later
- You can read JavaScript
- You have never heard of MCP before (that is fine, that is the point)

You do not need to know anything about protocols, networking, or AI systems. Those concepts will be introduced when they are needed.

---

## How to start

```bash
git clone https://github.com/pguso/mcp-from-scratch.git
cd mcp-from-scratch
```

Open [`01-what-is-mcp/README.md`](./01-what-is-mcp/README.md).

Do not skip ahead. Each module assumes you have run the code in the previous one.

---

## The specification

This repository teaches the MCP specification version `2025-11-25`. Every module links to the relevant section. Once you finish module 11, you will be able to read the full specification and understand all of it. Module 12 is readable after module 06 if you want to run the agent examples; modules 07–11 are not blockers for that narrative.

The specification lives at: [https://modelcontextprotocol.io/specification/2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)

---

## What this repository is not

It is not a production MCP SDK. It is not the fastest path to shipping. It is not a collection of examples you copy and modify.

It is a path from zero to genuine understanding. When you finish, you will know what every MCP SDK does under the hood - because you will have done it yourself.
