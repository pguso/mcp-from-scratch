// server.js - MCP server that requests LLM completions from the client (sampling)
//
// After the handshake, the server may send JSON-RPC *requests* to the client
// (not just notifications). sampling/createMessage asks the host's model to
// generate text; the client returns an assistant message.
//
// Run via the client: node src/client.js
// Or manually:       node src/server.js

import { createFramer } from '../../03-stdio-transport/src/framing.js';
import { Dispatcher } from '../../02-json-rpc/src/dispatcher.js';
import {
  decode,
  encodeError,
  encodeRequest,
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
} from '../../07-errors/src/errors.js';

// ─── Server identity ──────────────────────────────────────────────────────────

const SERVER_INFO = {
  name:    'mcp-from-scratch',
  version: '0.1.0',
};

const SERVER_CAPABILITIES = {
  tools: {},
};

// Outbound request ids start high so they do not collide with the client's 1, 2, 3…
let nextOutboundId = 10_000;

/** @type {Map<number, { resolve: Function, reject: Function }>} */
const outboundPending = new Map();

// ─── Registries ───────────────────────────────────────────────────────────────

const toolRegistry = new ToolRegistry();

/** @type {Map<string, (args: object) => object|Promise<object>>} */
const toolHandlers = new Map();

function registerTool(definition, handler) {
  toolRegistry.register(definition);
  toolHandlers.set(definition.name, handler);
}

// ─── Client capability helpers ────────────────────────────────────────────────

function clientSupportsSampling() {
  return session.clientCapabilities?.sampling != null;
}

/**
 * Send a JSON-RPC request to the client and wait for its response.
 * Only valid after the session is READY.
 *
 * @param {string} method
 * @param {object} params
 * @returns {Promise<*>}
 */
function requestClient(method, params = {}) {
  if (!session.isReady()) {
    return Promise.reject(new Error('Cannot request client before session is READY'));
  }

  const id = nextOutboundId++;
  return new Promise((resolve, reject) => {
    outboundPending.set(id, { resolve, reject });
    process.stdout.write(encodeRequest(id, method, params));
  });
}

// Internal routing table - only the server knows these mappings.
const ROUTES = {
  billing:   { team: 'team-finance', sla: '24 hours' },
  technical: { team: 'team-eng',     sla: '48 hours' },
  urgent:    { team: 'on-call',      sla: '1 hour' },
};

const CATEGORIES = Object.keys(ROUTES);

/**
 * Ask the client's model to classify a support message via sampling/createMessage.
 *
 * @param {string} message
 * @returns {Promise<string>} raw assistant text
 */
async function sampleCategory(message) {
  const result = await requestClient('sampling/createMessage', {
    messages: [
      {
        role:    'user',
        content: {
          type: 'text',
          text: `Classify this support message:\n\n${message}`,
        },
      },
    ],
    systemPrompt:
      'You classify support tickets. Reply with exactly one word: billing, technical, or urgent.',
    maxTokens: 64,
  });

  const text = result?.content?.type === 'text' ? result.content.text : null;
  if (typeof text !== 'string' || text.trim() === '') {
    throw internalError('sampling/createMessage returned no assistant text');
  }
  return text;
}

/**
 * Extract a known category label from model output.
 *
 * @param {string} text
 * @returns {{ category: string, fallback: boolean }}
 */
function parseCategory(text) {
  const normalized = text.toLowerCase().replace(/[^a-z]/g, ' ');
  for (const category of CATEGORIES) {
    if (normalized.includes(category)) {
      return { category, fallback: false };
    }
  }
  return { category: 'technical', fallback: true };
}

// ─── Demo tools ───────────────────────────────────────────────────────────────

registerTool(
  {
    name:        'route_support_ticket',
    title:       'Route support ticket',
    description:
      'Classifies a support message via sampling/createMessage, then routes it using server-side rules.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type:        'string',
          description: 'Customer support message to classify and route',
        },
      },
      required: ['message'],
    },
  },
  async (args) => {
    if (!clientSupportsSampling()) {
      return toolError(
        'Client did not declare sampling capability in initialize'
      );
    }

    const message = args?.message;
    if (typeof message !== 'string' || message.trim() === '') {
      return toolError(
        'route_support_ticket requires a non-empty string "message"'
      );
    }

    try {
      const raw = await sampleCategory(message.trim());
      const { category, fallback } = parseCategory(raw);
      const route = ROUTES[category];

      const lines = [
        `Category: ${category}`,
        `Routed to: ${route.team}`,
        `SLA: ${route.sla}`,
      ];
      if (fallback) {
        lines.push('(Used technical fallback - model reply was not a known label)');
      }

      return toolSuccess(lines.join('\n'));
    } catch (err) {
      if (isProtocolError(err)) {
        return toolError(`Sampling failed: ${err.message}`);
      }
      const message = err?.message ?? 'Sampling failed';
      return toolError(message);
    }
  }
);

registerTool(
  {
    name:        'echo',
    title:       'Echo',
    description: 'Returns the message unchanged (no sampling).',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type:        'string',
          description: 'Text to echo',
        },
      },
      required: ['message'],
    },
  },
  (args) => {
    const message = args?.message;
    if (typeof message !== 'string' || message.trim() === '') {
      return toolError('echo requires a non-empty string "message"');
    }
    return toolSuccess(message);
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

  // Responses to our outbound sampling requests (server → client).
  if (msg.type === MessageType.Response) {
    const entry = outboundPending.get(msg.id);
    if (entry) {
      outboundPending.delete(msg.id);
      entry.resolve(msg.result);
      return;
    }
  }

  if (msg.type === MessageType.Error) {
    const entry = outboundPending.get(msg.id);
    if (entry) {
      outboundPending.delete(msg.id);
      entry.reject(msg.error);
      return;
    }
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

// ─── Lifecycle ────────────────────────────────────────────────────────────────

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

// ─── tools/list + tools/call ──────────────────────────────────────────────────

dispatcher.register('tools/list', async (_params) => {
  return { tools: toolRegistry.list() };
});

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
