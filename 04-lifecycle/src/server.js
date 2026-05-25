// server.js - MCP server with lifecycle handshake
//
// This is the first file in the course that implements real MCP behaviour.
// It still uses the stdio transport and JSON-RPC stack from modules 02–03,
// but now enforces the initialization sequence before handling anything else.
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
  PROTOCOL_VERSION,
} from './session.js';

// ─── Server identity (returned in initialize) ─────────────────────────────────

const SERVER_INFO = {
  name:    'mcp-from-scratch',
  version: '0.1.0',
};

const SERVER_CAPABILITIES = {
  tools: { listChanged: true },
};

// ─── Session + dispatcher ─────────────────────────────────────────────────────

const session = new Session('server');
const dispatcher = new Dispatcher();

dispatcher.onOutput = (line) => {
  process.stdout.write(line);
};

// ─── Lifecycle gatekeeper ─────────────────────────────────────────────────────
//
// The dispatcher knows nothing about MCP session state. We decode each line
// first, check whether the message is allowed in the current state, and only
// then forward to the dispatcher.

createFramer(process.stdin, async (line) => {
  let msg;
  try {
    msg = decode(line);
  } catch {
    // Malformed JSON - let the dispatcher produce a ParseError response.
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
      // Unhandled or disallowed notifications are silently ignored per JSON-RPC.
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

// ─── Demo handlers (only meaningful once READY) ─────────────────────────────

// ping is allowed even before READY (per the MCP lifecycle spec).
dispatcher.register('ping', async () => {
  return { time: new Date().toISOString() };
});

// echo demonstrates that normal methods work only after the handshake.
dispatcher.register('echo', async (params) => {
  return { echo: params };
});
