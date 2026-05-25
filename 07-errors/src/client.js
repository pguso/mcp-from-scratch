// client.js - demonstrate protocol errors vs isError tool results
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
import { Session, PROTOCOL_VERSION } from '../../04-lifecycle/src/session.js';

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

async function handshake() {
  console.log('[client] starting MCP handshake\n');

  try {
    await sendUnchecked('tools/call', { name: 'echo', arguments: { message: 'early' } });
    console.log('tools/call before init → unexpected success');
  } catch (err) {
    console.log('tools/call before init → rejected (expected):', err.message);
  }

  const initResult = await send('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities:    {},
    clientInfo: {
      name:    'mcp-from-scratch-client',
      version: '0.1.0',
    },
  });
  session.onInitializeResult(initResult);

  console.log('initialize → server:', initResult.serverInfo?.name);

  notify('notifications/initialized', {});
  session.onInitializedSent();

  console.log('\n[client] handshake complete, session state:', session.state);
}

function printCallResult(label, result) {
  const blocks = result.content ?? [];
  const isError = result.isError === true;

  console.log(`  ${label}`);
  console.log(`    isError: ${isError}`);
  for (const block of blocks) {
    if (block.type === 'text') {
      console.log(`    text:    ${block.text}`);
    } else {
      console.log(`    content: ${JSON.stringify(block)}`);
    }
  }
  console.log();
}

function printProtocolError(label, err) {
  console.log(`  ${label}`);
  console.log(`    JSON-RPC error code:    ${err.code}`);
  console.log(`    JSON-RPC error message: ${err.message}`);
  console.log();
}

async function callTool(label, params) {
  try {
    const result = await send('tools/call', params);
    printCallResult(label, result);
    return { ok: true, result };
  } catch (err) {
    printProtocolError(label, err);
    return { ok: false, error: err };
  }
}

async function main() {
  await handshake();

  console.log('--- tool success (isError: false) ---\n');

  await callTool('echo → success', {
    name:      'echo',
    arguments: { message: 'hello from MCP' },
  });

  await callTool('divide → success', {
    name:      'divide',
    arguments: { a: 10, b: 4 },
  });

  console.log('--- tool execution errors (isError: true, still a JSON-RPC result) ---\n');

  await callTool('divide → tool error (b = 0)', {
    name:      'divide',
    arguments: { a: 10, b: 0 },
  });

  await callTool('validate_email → tool error (bad format)', {
    name:      'validate_email',
    arguments: { email: 'not-an-email' },
  });

  await callTool('unstable → handler throw → tool error', {
    name:      'unstable',
    arguments: {},
  });

  console.log('--- protocol errors (JSON-RPC error object, no result) ---\n');

  await callTool('unknown tool → protocol error', {
    name:      'nonexistent',
    arguments: {},
  });

  await callTool('missing name → protocol error', {
    arguments: { message: 'oops' },
  });

  await callTool('arguments must be object → protocol error', {
    name:      'echo',
    arguments: ['not', 'an', 'object'],
  });

  console.log('[client] done, closing connection');
  session.close();
  child.stdin.end();
}

main().catch((err) => {
  console.error('[client] unhandled error:', err);
  process.exit(1);
});
