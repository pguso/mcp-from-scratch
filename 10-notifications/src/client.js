// client.js - listen for server-pushed notifications and refresh state
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

/** Serialise notification side-effects so logs stay readable. */
let notificationChain = Promise.resolve();

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

function previewText(text, maxLen = 80) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen)}…`;
}

async function handleServerNotification(method, params) {
  console.log('[client] notification from server:', method, params ?? {});

  if (method === 'notifications/tools/list_changed') {
    const result = await send('tools/list', {});
    const names = (result.tools ?? []).map((t) => t.name).join(', ');
    console.log(`[client] refreshed tools/list → ${result.tools?.length ?? 0} tool(s): ${names}\n`);
    return;
  }

  if (method === 'notifications/resources/list_changed') {
    const result = await send('resources/list', {});
    const uris = (result.resources ?? []).map((r) => r.uri).join(', ');
    console.log(
      `[client] refreshed resources/list → ${result.resources?.length ?? 0} resource(s): ${uris}\n`
    );
    return;
  }

  if (method === 'notifications/resources/updated') {
    const uri = params?.uri;
    if (typeof uri !== 'string') {
      console.log('[client] updated notification missing uri, skipping re-read\n');
      return;
    }

    const result = await send('resources/read', { uri });
    const text = result.contents?.[0]?.text;
    console.log(`[client] refreshed resources/read → ${uri}`);
    if (typeof text === 'string') {
      console.log(`    text: ${previewText(text)}\n`);
    }
  }
}

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
    notificationChain = notificationChain
      .then(() => handleServerNotification(msg.method, msg.params ?? {}))
      .catch((err) => {
        console.error('[client] notification handler error:', err);
      });
  }
});

/** Wait until all notification handlers triggered so far have finished. */
async function drainNotifications() {
  while (true) {
    const current = notificationChain;
    await current;
    if (notificationChain === current) return;
  }
}

async function handshake() {
  console.log('[client] starting MCP handshake\n');

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
    '  tools capability:     ',
    JSON.stringify(initResult.capabilities?.tools)
  );
  console.log(
    '  resources capability: ',
    JSON.stringify(initResult.capabilities?.resources)
  );

  notify('notifications/initialized', {});
  session.onInitializedSent();

  console.log('\n[client] handshake complete, session state:', session.state);
}

function printToolNames(label, result) {
  const tools = result.tools ?? [];
  console.log(`[client] ${label} → ${tools.length} tool(s): ${tools.map((t) => t.name).join(', ')}\n`);
}

function printResourceUris(label, result) {
  const resources = result.resources ?? [];
  console.log(
    `[client] ${label} → ${resources.length} resource(s): ${resources.map((r) => r.uri).join(', ')}\n`
  );
}

function printCallResult(toolName, result) {
  const text = result.content?.[0]?.text ?? JSON.stringify(result);
  console.log(`  tools/call → ${toolName}`);
  console.log(`    isError: ${result.isError === true}`);
  console.log(`    text:    ${text}\n`);
}

async function main() {
  await handshake();

  console.log('--- initial discovery ---\n');

  const toolsBefore = await send('tools/list', {});
  printToolNames('tools/list', toolsBefore);

  const resourcesBefore = await send('resources/list', {});
  printResourceUris('resources/list', resourcesBefore);

  console.log('--- subscribe to demo://status ---\n');

  await send('resources/subscribe', { uri: 'demo://status' });
  console.log('[client] resources/subscribe → demo://status (ok)\n');

  const statusBefore = await send('resources/read', { uri: 'demo://status' });
  console.log('  resources/read → demo://status (before publish)');
  console.log(`    text: ${previewText(statusBefore.contents?.[0]?.text ?? '')}\n`);

  console.log('--- tools that push notifications ---\n');

  async function callTool(name, args) {
    const result = await send('tools/call', { name, arguments: args });
    await drainNotifications();
    printCallResult(name, result);
    return result;
  }

  await callTool('publish_status', { message: 'All systems operational' });
  await callTool('add_note', { text: 'Remember to re-list after list_changed' });
  await callTool('register_extra_tool', {});

  await drainNotifications();

  console.log('[client] done, closing connection');
  session.close();
  child.stdin.end();
}

main().catch((err) => {
  console.error('[client] unhandled error:', err);
  process.exit(1);
});
