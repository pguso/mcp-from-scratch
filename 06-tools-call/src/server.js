// server.js - MCP server that handles tools/list and tools/call
//
// Module 05 advertised tools. This module runs them. Each tool has:
//   - a definition in the registry (discovery)
//   - a handler function (execution)
//
// Run via the client: node src/client.js
// Or manually:       node src/server.js

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
import { ToolRegistry } from '../../05-tools-list/src/registry.js';

// ─── Server identity ──────────────────────────────────────────────────────────

const SERVER_INFO = {
  name:    'mcp-from-scratch',
  version: '0.1.0',
};

const SERVER_CAPABILITIES = {
  tools: { listChanged: true },
};

// ─── Tool result helper ───────────────────────────────────────────────────────
//
// MCP tool results are always shaped as { content: [...], isError?: boolean }.
// This helper keeps handlers focused on the payload, not the wire format.

/**
 * @param {string} text
 * @param {boolean} [isError]
 * @returns {{ content: object[], isError: boolean }}
 */
function textResult(text, isError = false) {
  return {
    content: [{ type: 'text', text }],
    isError,
  };
}

// ─── Registry + handlers ──────────────────────────────────────────────────────

const registry = new ToolRegistry();

/** @type {Map<string, (args: object) => object|Promise<object>>} */
const handlers = new Map();

/**
 * Register a tool definition and its implementation together.
 *
 * @param {object} definition - MCP Tool object for tools/list.
 * @param {(args: object) => object|Promise<object>} handler - Returns a CallToolResult.
 */
function registerTool(definition, handler) {
  registry.register(definition);
  handlers.set(definition.name, handler);
}

registerTool(
  {
    name:        'echo',
    title:       'Echo',
    description: 'Returns the message you send, unchanged.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type:        'string',
          description: 'Text to echo back',
        },
      },
      required: ['message'],
    },
  },
  (args) => {
    const message = args?.message;
    if (typeof message !== 'string') {
      return textResult('echo requires a string "message" argument', true);
    }
    return textResult(message);
  }
);

registerTool(
  {
    name:        'get_time',
    title:       'Current time',
    description: 'Returns the server clock as an ISO-8601 timestamp.',
    inputSchema: {
      type:                 'object',
      additionalProperties: false,
    },
  },
  () => textResult(new Date().toISOString())
);

registerTool(
  {
    name:        'add',
    title:       'Add numbers',
    description: 'Adds two numbers and returns the sum.',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First operand' },
        b: { type: 'number', description: 'Second operand' },
      },
      required: ['a', 'b'],
    },
  },
  (args) => {
    const a = args?.a;
    const b = args?.b;
    if (typeof a !== 'number' || typeof b !== 'number') {
      return textResult('add requires numeric "a" and "b" arguments', true);
    }
    return textResult(String(a + b));
  }
);

// ─── Session + dispatcher ─────────────────────────────────────────────────────

const session = new Session('server');
const dispatcher = new Dispatcher();

dispatcher.onOutput = (line) => {
  process.stdout.write(line);
};

// ─── Lifecycle gatekeeper ─────────────────────────────────────────────────────

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

// ─── MCP lifecycle handlers ───────────────────────────────────────────────────

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

// ─── tools/list ───────────────────────────────────────────────────────────────

dispatcher.register('tools/list', async (_params) => {
  return { tools: registry.list() };
});

// ─── tools/call ───────────────────────────────────────────────────────────────
//
// Params: { name: string, arguments?: object }
//
// Unknown tools → JSON-RPC InvalidParams (-32602). That is a protocol error:
// the request itself is wrong. Module 07 contrasts this with isError results.
//
// Handler failures we catch here return isError: true so the model can recover.

dispatcher.register('tools/call', async (params) => {
  const name = params?.name;

  if (typeof name !== 'string' || name.trim() === '') {
    throw { code: -32602, message: 'Invalid params: name is required' };
  }

  if (!registry.get(name)) {
    throw { code: -32602, message: `Unknown tool: ${name}` };
  }

  const handler = handlers.get(name);
  if (!handler) {
    throw { code: -32603, message: `Tool "${name}" has no handler` };
  }

  const args =
    params?.arguments === undefined || params?.arguments === null
      ? {}
      : params.arguments;

  if (typeof args !== 'object' || Array.isArray(args)) {
    throw { code: -32602, message: 'Invalid params: arguments must be an object' };
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
    const message = err?.message ?? 'Tool execution failed';
    return textResult(message, true);
  }
});
