// server.js - MCP server that handles prompts/list and prompts/get
//
// Prompts are reusable templates the user selects in the host UI.
// Also exposes one tool so Claude Desktop lists this server in Connectors.
// Run via the client: node src/client.js

import { createFramer } from '../../03-stdio-transport/src/framing.js';
import { Dispatcher } from '../../02-json-rpc/src/dispatcher.js';
import {
  decode,
  encodeError,
  MessageType,
} from '../../02-json-rpc/src/jsonrpc.js';
import {
  Session,
  negotiateProtocolVersion,
} from '../../04-lifecycle/src/session.js';
import { invalidParams } from '../../07-errors/src/errors.js';
import { ToolRegistry } from '../../05-tools-list/src/registry.js';
import { PromptRegistry } from './registry.js';
import { registerDemoPrompts } from './demo-prompts.js';

const SERVER_INFO = {
  name:    'mcp-from-scratch-prompts',
  version: '0.1.0',
};

const SERVER_CAPABILITIES = {
  tools:   { listChanged: true },
  prompts: { listChanged: true },
};

const promptRegistry = new PromptRegistry();
registerDemoPrompts(promptRegistry);

const toolRegistry = new ToolRegistry();

/** @type {Map<string, (args: object) => object|Promise<object>>} */
const toolHandlers = new Map();

function textResult(text, isError = false) {
  return {
    content: [{ type: 'text', text }],
    isError,
  };
}

function registerTool(definition, handler) {
  toolRegistry.register(definition);
  toolHandlers.set(definition.name, handler);
}

// Claude Desktop only shows servers with at least one tool in Connectors.
registerTool(
  {
    name:        'list_prompt_templates',
    title:       'List prompt templates',
    description:
      'Returns the MCP prompt templates on this server. In Claude Desktop use + → Add from this server.',
    inputSchema: {
      type:                 'object',
      additionalProperties: false,
    },
  },
  () => {
    const lines = promptRegistry.list().map((p) => `- ${p.name}: ${p.description}`);
    return textResult(
      `Available prompt templates (use + → Add from mcp-from-scratch-prompts):\n${lines.join('\n')}`
    );
  }
);

const session = new Session('server');
const dispatcher = new Dispatcher();

dispatcher.onOutput = (line) => {
  process.stdout.write(line);
};

createFramer(process.stdin, async (line) => {
  let msg;
  try {
    msg = decode(line);
  } catch {
    await dispatcher.dispatch(line);
    return;
  }

  if (msg.type === MessageType.Request) {
    if (!session.canAcceptRequest(msg.method)) {
      const err = session.rejectionForRequest(msg.method);
      dispatcher.onOutput(encodeError(msg.id, err.code, err.message, err.data));
      return;
    }
  }

  if (msg.type === MessageType.Notification) {
    if (!session.canAcceptNotification(msg.method)) {
      return;
    }
  }

  await dispatcher.dispatch(line);
});

process.stdin.on('end', () => {
  session.close();
  process.exit(0);
});

dispatcher.register('initialize', async (params) => {
  const version = negotiateProtocolVersion(params.protocolVersion);
  session.onInitializeRequest(params, version);

  return {
    protocolVersion: version,
    capabilities:    SERVER_CAPABILITIES,
    serverInfo:      SERVER_INFO,
  };
});

dispatcher.register('notifications/initialized', async () => {
  session.onInitializedNotification();
});

dispatcher.register('ping', async () => {
  return { time: new Date().toISOString() };
});

dispatcher.register('tools/list', async () => ({
  tools: toolRegistry.list(),
}));

dispatcher.register('tools/call', async (params) => {
  const name = params?.name;

  if (typeof name !== 'string' || name.trim() === '') {
    throw invalidParams('Invalid params: name is required');
  }

  if (!toolRegistry.get(name)) {
    throw invalidParams(`Unknown tool: ${name}`);
  }

  const handler = toolHandlers.get(name);
  if (!handler) {
    throw { code: -32603, message: `Tool "${name}" has no handler` };
  }

  const args =
    params?.arguments === undefined || params?.arguments === null
      ? {}
      : params.arguments;

  if (typeof args !== 'object' || Array.isArray(args)) {
    throw invalidParams('Invalid params: arguments must be an object');
  }

  try {
    const result = await handler(args);
    if (!result?.content || !Array.isArray(result.content)) {
      throw new Error(`Handler for "${name}" did not return a valid CallToolResult`);
    }
    return {
      content: result.content,
      isError: result.isError === true,
    };
  } catch (err) {
    if (typeof err?.code === 'number') {
      throw err;
    }
    return textResult(err?.message ?? 'Tool execution failed', true);
  }
});

dispatcher.register('prompts/list', async () => ({
  prompts: promptRegistry.list(),
}));

dispatcher.register('prompts/get', async (params) => {
  const name = params?.name;

  if (typeof name !== 'string' || name.trim() === '') {
    throw invalidParams('Invalid params: name is required');
  }

  if (!promptRegistry.get(name)) {
    throw invalidParams(`Unknown prompt: ${name}`);
  }

  const args = params?.arguments;
  if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
    throw invalidParams('Invalid params: arguments must be an object');
  }

  const result = await promptRegistry.resolve(name, args ?? {});

  if (!result || !Array.isArray(result.messages) || result.messages.length === 0) {
    throw {
      code:    -32603,
      message: `Resolver for "${name}" did not return messages`,
    };
  }

  return {
    description: result.description,
    messages:    result.messages,
  };
});
