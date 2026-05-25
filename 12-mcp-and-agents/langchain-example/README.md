# LangChain + MCP example (optional)

It demonstrates the same architecture as [`../src/agent-loop.js`](../src/agent-loop.js), but delegates MCP session management and tool schema translation to [`@langchain/mcp-adapters`](https://www.npmjs.com/package/@langchain/mcp-adapters).

---

## What this proves

| Step | Custom [src/agent-loop.js](../src/agent-loop.js) | This example |
|------|------------------------|--------------|
| Spawn MCP server | `createMcpSession()` | `MultiServerMCPClient` stdio config |
| Handshake | Written in [src/mcp-session.js](../src/mcp-session.js) | Inside the adapter |
| `tools/list` + schemas | `mcpToolsToModelTools()` | `client.getTools()` |
| `tools/call` | `mcp.callTool()` | Agent invokes LangChain tools |
| LLM | [src/llm.js](../src/llm.js) | `ChatOpenAI` + `createReactAgent` |

---

## Prerequisites

- Node.js 20+
- Module 06 server built ([`06-tools-call/src/server.js`](../../06-tools-call/src/server.js))
- OpenAI API key

---

## Run

From this directory:

```bash
npm install
cp .env.example .env
# Set OPENAI_API_KEY in .env
npm start
```

The agent asks the model to use the `add` tool (40 + 2). You should see tool invocation in the logged messages and a final answer containing `42`.

---

## Configuration

`agent.mjs` spawns the course server with stdio:

```javascript
{
  scratch: {
    transport: 'stdio',
    command: 'node',
    args: [pathTo06ToolsCallServer],
  },
}
```

`agent.mjs` calls `initializeConnections()` before `getTools()` - the client does not connect lazily on first tool use.

To point at a different server, change the resolved path in `agent.mjs`.

---

## Troubleshooting

**`OPENAI_API_KEY` missing** - create `.env` from `.env.example`.

**Connection / spawn errors** - ensure `node` is on your PATH and the path to [06-tools-call/src/server.js](../../06-tools-call/src/server.js) resolves correctly when run from this folder.

**Tool not found** - confirm module 06 defines `add`, `echo`, and `get_time`.
