// server.js - MCP server that exposes tools/list
//
// Builds on the lifecycle handshake from module 04. After the client sends
// notifications/initialized, it may call tools/list to discover what this
// server offers. Tool implementations arrive in module 06 - here we only
// publish definitions from the registry.
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
import { ToolRegistry } from './registry.js';

// ─── Server identity ──────────────────────────────────────────────────────────

const SERVER_INFO = {
  name:    'mcp-from-scratch',
  version: '0.1.0',
};

const SERVER_CAPABILITIES = {
  tools: { listChanged: true },
};

// ─── Tool definitions ─────────────────────────────────────────────────────────
//
// These are the tools we advertise. Module 06 will attach runnable handlers.

const registry = new ToolRegistry();

registry.register({
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
});

registry.register({
  name:        'get_time',
  title:       'Current time',
  description: 'Returns the server clock as an ISO-8601 timestamp.',
  inputSchema: {
    type:                 'object',
    additionalProperties: false,
  },
});

registry.register({
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
});

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
//
// Params may include an optional `cursor` for pagination. This teaching server
// returns every tool in one response - enough to learn discovery. Pagination
// is a spec feature you can add when your tool count grows.

dispatcher.register('tools/list', async (_params) => {
  return { tools: registry.list() };
});
