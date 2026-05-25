// server.js - MCP server that pushes notifications to the client
//
// After the handshake, the server may write JSON-RPC notifications to stdout
// without the client asking first. This module demonstrates:
//   - notifications/tools/list_changed
//   - notifications/resources/list_changed
//   - notifications/resources/updated (after resources/subscribe)
//
// Run via the client: node src/client.js
// Or manually:       node src/server.js

import { createFramer } from '../../03-stdio-transport/src/framing.js';
import { Dispatcher } from '../../02-json-rpc/src/dispatcher.js';
import {
  decode,
  encodeError,
  encodeNotification,
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
import { ResourceRegistry } from '../../08-resources/src/registry.js';

const RESOURCE_NOT_FOUND = -32002;

// ─── Server identity ──────────────────────────────────────────────────────────

const SERVER_INFO = {
  name:    'mcp-from-scratch',
  version: '0.1.0',
};

const SERVER_CAPABILITIES = {
  tools:     { listChanged: true },
  resources: { listChanged: true, subscribe: true },
};

// ─── Mutable demo state ───────────────────────────────────────────────────────

let statusMessage = 'Initial status (not yet published)';
let noteCount = 0;

/** URIs the client has subscribed to via resources/subscribe */
const subscribers = new Set();

// ─── Registries ───────────────────────────────────────────────────────────────

const toolRegistry = new ToolRegistry();
const resourceRegistry = new ResourceRegistry();

/** @type {Map<string, (args: object) => object|Promise<object>>} */
const toolHandlers = new Map();

function registerTool(definition, handler) {
  toolRegistry.register(definition);
  toolHandlers.set(definition.name, handler);
}

function registerResource(definition, read) {
  resourceRegistry.register(definition, read);
}

// ─── Outbound notifications ───────────────────────────────────────────────────
//
// Server → client messages use encodeNotification() and go straight to stdout.
// They are not routed through the dispatcher because there is no request id
// and no handler return value - only a fire-and-forget push.

/**
 * @param {string} method
 * @param {object} [params]
 */
function notifyClient(method, params = {}) {
  if (!session.isReady()) return;
  process.stdout.write(encodeNotification(method, params));
}

// ─── Demo resources ───────────────────────────────────────────────────────────

registerResource(
  {
    uri:         'demo://status',
    name:        'status',
    title:       'Live status',
    description: 'Mutable text; subscribe to receive updated notifications.',
    mimeType:    'text/plain',
  },
  () => ({
    uri:      'demo://status',
    mimeType: 'text/plain',
    text:     statusMessage,
  })
);

registerResource(
  {
    uri:         'demo://readme',
    name:        'readme',
    title:       'Notifications readme',
    description: 'Static resource; catalogue changes come from add_note.',
    mimeType:    'text/plain',
  },
  () => ({
    uri:      'demo://readme',
    mimeType: 'text/plain',
    text: [
      'This server pushes three notification types:',
      '  notifications/tools/list_changed',
      '  notifications/resources/list_changed',
      '  notifications/resources/updated (after resources/subscribe)',
    ].join('\n'),
  })
);

// ─── Demo tools (initial set) ─────────────────────────────────────────────────

registerTool(
  {
    name:        'publish_status',
    title:       'Publish status',
    description: 'Updates demo://status and notifies subscribers.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type:        'string',
          description: 'New status text',
        },
      },
      required: ['message'],
    },
  },
  (args) => {
    const message = args?.message;
    if (typeof message !== 'string' || message.trim() === '') {
      return toolError('publish_status requires a non-empty string "message"');
    }
    statusMessage = message;
    notifyResourceUpdated('demo://status');
    return toolSuccess(`Status published: ${message}`);
  }
);

registerTool(
  {
    name:        'add_note',
    title:       'Add note resource',
    description: 'Registers a new demo://note/N resource and notifies list_changed.',
    inputSchema: {
      type:                 'object',
      additionalProperties: false,
    },
  },
  (args) => {
    noteCount += 1;
    const uri = `demo://note/${noteCount}`;
    const body = typeof args?.text === 'string' ? args.text : `Note #${noteCount}`;

    registerResource(
      {
        uri,
        name:        `note-${noteCount}`,
        description: 'Dynamic note added at runtime.',
        mimeType:    'text/plain',
      },
      () => ({
        uri,
        mimeType: 'text/plain',
        text:     body,
      })
    );

    notifyClient('notifications/resources/list_changed');
    return toolSuccess(`Added resource ${uri}`);
  }
);

registerTool(
  {
    name:        'register_extra_tool',
    title:       'Register greet tool',
    description: 'Adds the greet tool at runtime and notifies tools/list_changed.',
    inputSchema: {
      type:                 'object',
      additionalProperties: false,
    },
  },
  () => {
    if (toolRegistry.get('greet')) {
      return toolError('greet is already registered');
    }

    registerTool(
      {
        name:        'greet',
        title:       'Greet',
        description: 'Returns a short greeting (registered dynamically).',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type:        'string',
              description: 'Name to greet',
            },
          },
          required: ['name'],
        },
      },
      (greetArgs) => {
        const name = greetArgs?.name;
        if (typeof name !== 'string' || name.trim() === '') {
          return toolError('greet requires a string "name"');
        }
        return toolSuccess(`Hello, ${name}!`);
      }
    );

    notifyClient('notifications/tools/list_changed');
    return toolSuccess('Registered tool: greet');
  }
);

/**
 * Notify every subscriber that a resource's content changed.
 *
 * @param {string} uri
 */
function notifyResourceUpdated(uri) {
  if (!subscribers.has(uri)) return;
  notifyClient('notifications/resources/updated', { uri });
}

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

// ─── resources/list + resources/read + resources/subscribe ────────────────────

dispatcher.register('resources/list', async (_params) => {
  return { resources: resourceRegistry.list() };
});

dispatcher.register('resources/read', async (params) => {
  const uri = params?.uri;

  if (typeof uri !== 'string' || uri.trim() === '') {
    throw invalidParams('Invalid params: uri is required');
  }

  if (!resourceRegistry.get(uri)) {
    throw {
      code:    RESOURCE_NOT_FOUND,
      message: 'Resource not found',
      data:    { uri },
    };
  }

  const block = await resourceRegistry.read(uri);

  if (!block || typeof block !== 'object') {
    throw internalError(`Reader for "${uri}" did not return content`);
  }

  const hasText = typeof block.text === 'string';
  const hasBlob = typeof block.blob === 'string';

  if (!hasText && !hasBlob) {
    throw internalError(`Reader for "${uri}" must return text or blob`);
  }

  return {
    contents: [
      {
        uri:      block.uri ?? uri,
        mimeType: block.mimeType,
        ...(hasText ? { text: block.text } : { blob: block.blob }),
      },
    ],
  };
});

dispatcher.register('resources/subscribe', async (params) => {
  if (!SERVER_CAPABILITIES.resources?.subscribe) {
    throw invalidParams('Server does not support resource subscriptions');
  }

  const uri = params?.uri;

  if (typeof uri !== 'string' || uri.trim() === '') {
    throw invalidParams('Invalid params: uri is required');
  }

  if (!resourceRegistry.get(uri)) {
    throw {
      code:    RESOURCE_NOT_FOUND,
      message: 'Resource not found',
      data:    { uri },
    };
  }

  subscribers.add(uri);
  return {};
});
