// agent-loop.js - minimal agent host: discover tools, local LLM picks one, MCP executes it
//
// Run from project root:
//   npm install --prefix 12-mcp-and-agents
//   node 12-mcp-and-agents/src/agent-loop.js
//
// This is the Host from module 01. LangChain's adapter automates the same steps;
// see ../langchain-example/ for that path.

import { createMcpSession, defaultServerPath, textFromToolResult } from './mcp-session.js';
import { mcpToolsToModelTools } from './tool-schema.js';
import {
  chooseTool,
  disposeLlm,
  finalAnswer,
  initLlm,
  modelLabel,
} from './llm.js';

const USER_GOAL = 'What can you do with the echo tool?';

async function main() {
  console.log(`[agent] MCP agent loop (local LLM: ${modelLabel()})\n`);
  console.log(`[agent] user goal: ${USER_GOAL}\n`);

  /** @type {Awaited<ReturnType<typeof createMcpSession>> | null} */
  let mcp = null;

  try {
    await initLlm();
    mcp = await createMcpSession(defaultServerPath());

    // ── Plan: discover tools (tools/list) ─────────────────────────────────────
    console.log('[agent] plan → tools/list');
    const listResult = await mcp.listTools();
    const modelTools = mcpToolsToModelTools(listResult);

    console.log(`[agent] discovered ${modelTools.length} tool(s):`);
    for (const t of modelTools) {
      console.log(`  • ${t.name}: ${t.description}`);
    }
    console.log();

    // ── Plan: LLM chooses a tool ───────────────────────────────────────────────
    console.log('[agent] plan → local LLM chooses tool');
    const toolCall = await chooseTool(USER_GOAL, modelTools);
    console.log(`[agent] model wants: ${toolCall.name}(${JSON.stringify(toolCall.arguments)})\n`);

    // ── Act: run the tool (tools/call) ─────────────────────────────────────────
    console.log('[agent] act → tools/call');
    const callResult = await mcp.callTool(toolCall.name, toolCall.arguments);
    const toolText = textFromToolResult(callResult);
    console.log(`[agent] tool result (isError=${callResult.isError === true}):`);
    console.log(`  ${toolText}\n`);

    // ── Observe: feed result back to the LLM for the final answer ──────────────
    console.log('[agent] observe → local LLM final answer');
    const answer = await finalAnswer(
      USER_GOAL,
      toolCall,
      toolText,
      callResult.isError === true
    );
    console.log('[agent] reply to user:');
    console.log(answer);
    console.log();
  } finally {
    if (mcp != null) {
      console.log('[agent] closing MCP session');
      mcp.close();
    }
    console.log('[agent] disposing local LLM');
    await disposeLlm();
  }
}

main().catch((err) => {
  console.error('[agent] unhandled error:', err);
  process.exit(1);
});
