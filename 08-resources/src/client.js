// client.js - handshake, then resources/list and resources/read
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
    await sendUnchecked('resources/list', {});
    console.log('resources/list before init → unexpected success');
  } catch (err) {
    console.log('resources/list before init → rejected (expected):', err.message);
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
  console.log(
    '  resources capability:',
    JSON.stringify(initResult.capabilities?.resources)
  );

  notify('notifications/initialized', {});
  session.onInitializedSent();

  console.log('\n[client] handshake complete, session state:', session.state);
}

function printResources(result) {
  const resources = result.resources ?? [];

  console.log(`\n[client] resources/list → ${resources.length} resource(s)\n`);

  for (const resource of resources) {
    console.log(`  • ${resource.uri}`);
    console.log(`    name:        ${resource.name}`);
    if (resource.title) {
      console.log(`    title:       ${resource.title}`);
    }
    if (resource.description) {
      console.log(`    description: ${resource.description}`);
    }
    if (resource.mimeType) {
      console.log(`    mimeType:    ${resource.mimeType}`);
    }
    console.log();
  }
}

function previewText(text, maxLen = 120) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen)}…`;
}

function printReadResult(label, result) {
  const contents = result.contents ?? [];

  console.log(`  ${label}`);
  for (const block of contents) {
    console.log(`    uri:      ${block.uri}`);
    if (block.mimeType) {
      console.log(`    mimeType: ${block.mimeType}`);
    }
    if (typeof block.text === 'string') {
      console.log(`    text:     ${previewText(block.text)}`);
    } else if (typeof block.blob === 'string') {
      console.log(`    blob:     (${block.blob.length} base64 chars)`);
    }
  }
  console.log();
}

function printReadError(label, err) {
  console.log(`  ${label}`);
  console.log(`    JSON-RPC error code:    ${err.code}`);
  console.log(`    JSON-RPC error message: ${err.message}`);
  if (err.data) {
    console.log(`    data:                   ${JSON.stringify(err.data)}`);
  }
  console.log();
}

async function readResource(label, params) {
  try {
    const result = await send('resources/read', params);
    printReadResult(label, result);
    return { ok: true, result };
  } catch (err) {
    printReadError(label, err);
    return { ok: false, error: err };
  }
}

async function main() {
  await handshake();

  console.log('--- resource discovery ---\n');

  try {
    const listResult = await send('resources/list', {});
    printResources(listResult);

    console.log('--- read each listed resource ---\n');

    for (const resource of listResult.resources ?? []) {
      await readResource(`resources/read → ${resource.uri}`, { uri: resource.uri });
    }
  } catch (err) {
    console.error('resources/list error:', err);
  }

  console.log('--- read errors ---\n');

  await readResource('unknown uri → Resource not found (-32002)', {
    uri: 'demo://does-not-exist',
  });

  await readResource('missing uri → Invalid params (-32602)', {});

  console.log('[client] done, closing connection');
  session.close();
  child.stdin.end();
}

main().catch((err) => {
  console.error('[client] unhandled error:', err);
  process.exit(1);
});
