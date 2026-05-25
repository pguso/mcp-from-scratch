// client.js - perform the MCP initialize handshake, then call demo methods
//
// This client demonstrates the full lifecycle from the client's perspective:
//   1. Prove that requests before initialize are rejected.
//   2. Send initialize and wait for the response.
//   3. Send notifications/initialized.
//   4. Call normal methods once the session is READY.
//
// Run with: node src/client.js

import { spawn } from 'child_process';
import { createFramer } from '../../03-stdio-transport/src/framing.js';
import {
  encodeRequest,
  encodeNotification,
  decode,
  MessageType,
} from '../../02-json-rpc/src/jsonrpc.js';
import { Session, PROTOCOL_VERSION } from './session.js';

// ─── Spawn the server ─────────────────────────────────────────────────────────

const serverPath = new URL('./server.js', import.meta.url).pathname;

const child = spawn(process.execPath, [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

child.on('exit', (code, signal) => {
  if (code !== 0 && code !== null) {
    console.error(`[client] server exited with code ${code}`);
  } else if (signal) {
    console.error(`[client] server killed by signal ${signal}`);
  }
});

// ─── Session + pending requests ───────────────────────────────────────────────

const session = new Session('client');
const pending = new Map();
let nextId = 1;

createFramer(child.stdout, (line) => {
  let msg;
  try {
    msg = decode(line);
  } catch (err) {
    console.error('[client] could not decode:', line, err);
    return;
  }

  if (msg.type === MessageType.Response) {
    const entry = pending.get(msg.id);
    if (entry) {
      pending.delete(msg.id);
      entry.resolve(msg.result);
    }
    return;
  }

  if (msg.type === MessageType.Error) {
    const entry = pending.get(msg.id);
    if (entry) {
      pending.delete(msg.id);
      entry.reject(msg.error);
    }
    return;
  }

  if (msg.type === MessageType.Notification) {
    console.log('[client] notification from server:', msg.method, msg.params);
  }
});

/**
 * Send a request without enforcing client session rules.
 * Used to prove the server rejects messages the client should not send.
 */
function sendUnchecked(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(encodeRequest(id, method, params));
  });
}

function send(method, params = {}) {
  if (!session.canSendRequest(method)) {
    return Promise.reject(
      new Error(`Cannot send ${method} in state ${session.state}`)
    );
  }

  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(encodeRequest(id, method, params));
    if (method === 'initialize') {
      session.onInitializeSent();
    }
  });
}

function notify(method, params = {}) {
  child.stdin.write(encodeNotification(method, params));
}

// ─── Handshake ────────────────────────────────────────────────────────────────

async function handshake() {
  console.log('[client] starting MCP handshake\n');

  // 1. Request before initialize - server must reject it.
  // We bypass client-side guards so the server is what rejects us.
  try {
    await sendUnchecked('echo', { message: 'too early' });
    console.log('echo before init → unexpected success');
  } catch (err) {
    console.log('echo before init → rejected (expected):', err.message);
  }

  // 2. initialize request
  const initResult = await send('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities:    {},
    clientInfo: {
      name:    'mcp-from-scratch-client',
      version: '0.1.0',
    },
  });
  session.onInitializeResult(initResult);

  console.log('\ninitialize →');
  console.log('  protocolVersion:', initResult.protocolVersion);
  console.log('  serverInfo:     ', initResult.serverInfo);
  console.log('  capabilities:   ', JSON.stringify(initResult.capabilities));

  // 3. notifications/initialized - client tells server we are ready.
  notify('notifications/initialized', {});
  session.onInitializedSent();

  console.log('\n[client] handshake complete, session state:', session.state);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await handshake();

  console.log('\n--- requests after handshake ---\n');

  try {
    const pong = await send('ping');
    console.log('ping →', pong);
  } catch (err) {
    console.error('ping error:', err);
  }

  try {
    const echoed = await send('echo', { message: 'hello after init' });
    console.log('echo →', JSON.stringify(echoed));
  } catch (err) {
    console.error('echo error:', err);
  }

  // Second initialize should fail - handshake already completed.
  try {
    await sendUnchecked('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities:    {},
      clientInfo:      { name: 'again', version: '0.1.0' },
    });
    console.log('re-initialize → unexpected success');
  } catch (err) {
    console.log('re-initialize → rejected (expected):', err.message);
  }

  console.log('\n[client] done, closing connection');
  session.close();
  child.stdin.end();
}

main().catch((err) => {
  console.error('[client] unhandled error:', err);
  process.exit(1);
});
