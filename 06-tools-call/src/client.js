// client.js - handshake, then call tools and print their results
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

// ─── Display tool results ─────────────────────────────────────────────────────

function printCallResult(toolName, args, result) {
  const blocks = result.content ?? [];
  const isError = result.isError === true;

  console.log(`  tools/call → ${toolName}`);
  console.log(`    arguments: ${JSON.stringify(args)}`);
  console.log(`    isError:   ${isError}`);

  for (const block of blocks) {
    if (block.type === 'text') {
      console.log(`    text:      ${block.text}`);
    } else {
      console.log(`    content:   ${JSON.stringify(block)}`);
    }
  }
  console.log();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await handshake();

  console.log('--- tool invocation ---\n');

  const calls = [
    { name: 'echo',     arguments: { message: 'hello from MCP' } },
    { name: 'add',      arguments: { a: 40, b: 2 } },
    { name: 'get_time', arguments: {} },
  ];

  for (const params of calls) {
    try {
      const result = await send('tools/call', params);
      printCallResult(params.name, params.arguments, result);
    } catch (err) {
      console.error(`  tools/call → ${params.name} failed:`, err.message ?? err);
      console.log();
    }
  }

  // Unknown tool → protocol error (JSON-RPC), not isError result.
  try {
    await send('tools/call', { name: 'nonexistent', arguments: {} });
    console.log('  unknown tool → unexpected success');
  } catch (err) {
    console.log('  unknown tool → protocol error (expected):', err.message);
    console.log();
  }

  console.log('[client] done, closing connection');
  session.close();
  child.stdin.end();
}

main().catch((err) => {
  console.error('[client] unhandled error:', err);
  process.exit(1);
});
