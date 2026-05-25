// agent.mjs - LangChain agent with MCP tools from module 06
//
// Run: npm install && cp .env.example .env && npm start
//
// MultiServerMCPClient replaces the hand-rolled mcp-session.js + tool-schema.js
// from ../src/. createReactAgent runs the plan/act/observe loop with a real LLM.

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, '../../06-tools-call/src/server.js');

if (!process.env.OPENAI_API_KEY) {
  console.error('Set OPENAI_API_KEY in .env (see .env.example)');
  process.exit(1);
}

const modelName = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

// Constructor takes a map of server name → connection (not wrapped in mcpServers).
const client = new MultiServerMCPClient({
  scratch: {
    transport: 'stdio',
    command:   'node',
    args:      [serverPath],
  },
});

console.log('[langchain] connecting to MCP server:', serverPath);
console.log('[langchain] model:', modelName, '\n');

try {
  await client.initializeConnections();
  const tools = client.getTools();
  console.log(
    '[langchain] loaded tools:',
    tools.map((t) => t.name).join(', '),
    '\n'
  );

  const model = new ChatOpenAI({
    model:       modelName,
    temperature: 0,
  });

  const agent = createReactAgent({ llm: model, tools });

  const userMessage =
    'Use the add tool to compute 40 + 2. Reply with only the numeric result.';

  console.log('[langchain] user:', userMessage, '\n');

  const response = await agent.invoke({
    messages: [{ role: 'user', content: userMessage }],
  });

  const last = response.messages?.at(-1);
  const text =
    typeof last?.content === 'string'
      ? last.content
      : JSON.stringify(last?.content ?? response);

  console.log('[langchain] final message:', text);
} catch (err) {
  console.error('[langchain] error:', err);
  process.exit(1);
} finally {
  await client.close();
  console.log('\n[langchain] MCP client closed');
}
