// server.js - MCP server demonstrating protocol errors vs isError tool results
//
// Module 06 introduced both paths inline. This module pulls them into errors.js
// so the distinction is explicit and reusable.
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
import {
  invalidParams,
  internalError,
  isProtocolError,
  normalizeToolResult,
  toolError,
  toolSuccess,
} from './errors.js';

// ─── Server identity ──────────────────────────────────────────────────────────

const SERVER_INFO = {
  name:    'mcp-from-scratch',
  version: '0.1.0',
};

const SERVER_CAPABILITIES = {
  tools: { listChanged: true },
};

// ─── Registry + handlers ──────────────────────────────────────────────────────

const registry = new ToolRegistry();

/** @type {Map<string, (args: object) => object|Promise<object>>} */
const handlers = new Map();

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
      return toolError('echo requires a string "message" argument');
    }
    return toolSuccess(message);
  }
);

registerTool(
  {
    name:        'divide',
    title:       'Divide',
    description: 'Divides a by b. Returns a tool error when b is zero.',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'Dividend' },
        b: { type: 'number', description: 'Divisor' },
      },
      required: ['a', 'b'],
    },
  },
  (args) => {
    const a = args?.a;
    const b = args?.b;
    if (typeof a !== 'number' || typeof b !== 'number') {
      return toolError('divide requires numeric "a" and "b" arguments');
    }
    if (b === 0) {
      return toolError('division by zero: b must not be 0');
    }
    return toolSuccess(String(a / b));
  }
);

registerTool(
  {
    name:        'validate_email',
    title:       'Validate email',
    description: 'Checks a simple email format. Returns isError when invalid.',
    inputSchema: {
      type: 'object',
      properties: {
        email: {
          type:        'string',
          description: 'Address to validate',
        },
      },
      required: ['email'],
    },
  },
  (args) => {
    const email = args?.email;
    if (typeof email !== 'string' || email.trim() === '') {
      return toolError('validate_email requires a non-empty "email" string');
    }
    const simple = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!simple.test(email)) {
      return toolError(
        `Invalid email format: "${email}". Expected something like user@example.com`
      );
    }
    return toolSuccess(`Valid email: ${email}`);
  }
);

// Simulates an unexpected failure inside the handler (API down, bug, etc.).
// tools/call catches non-protocol throws and converts them to isError results.
registerTool(
  {
    name:        'unstable',
    title:       'Unstable',
    description: 'Throws on purpose to demonstrate handler exceptions → isError.',
    inputSchema: {
      type:                 'object',
      additionalProperties: false,
    },
  },
  () => {
    throw new Error('upstream API unreachable');
  }
);

// ─── Session + dispatcher ─────────────────────────────────────────────────────

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

dispatcher.register('tools/list', async (_params) => {
  return { tools: registry.list() };
});

// ─── tools/call ───────────────────────────────────────────────────────────────
//
// Protocol errors (throw invalidParams / internalError):
//   - malformed params (missing name, arguments not an object)
//   - unknown tool name
//   - missing handler (server bug)
//
// Tool errors (return toolError):
//   - handler validates business rules and returns isError: true
//
// See errors.js for the full decision table.

dispatcher.register('tools/call', async (params) => {
  const name = params?.name;

  if (typeof name !== 'string' || name.trim() === '') {
    throw invalidParams('Invalid params: name is required');
  }

  if (!registry.get(name)) {
    throw invalidParams(`Unknown tool: ${name}`);
  }

  const handler = handlers.get(name);
  if (!handler) {
    throw internalError(`Tool "${name}" has no handler`);
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
    return normalizeToolResult(result, name);
  } catch (err) {
    if (isProtocolError(err)) {
      throw err;
    }
    const message = err?.message ?? 'Tool execution failed';
    return toolError(message);
  }
});
