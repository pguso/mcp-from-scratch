// client.js - MCP host with local LLM for sampling/createMessage
//
// Run from 11-sampling/: npm install && npm start

import { spawn } from 'child_process';
import { createFramer } from '../../03-stdio-transport/src/framing.js';
import {
  encodeRequest,
  encodeResponse,
  encodeError,
  encodeNotification,
  decode,
  MessageType,
  ErrorCode,
} from '../../02-json-rpc/src/jsonrpc.js';
import { Session, PROTOCOL_VERSION } from '../../04-lifecycle/src/session.js';
import { initLlm, runSampling, disposeLlm } from './llm.js';

const serverPath = new URL('./server.js', import.meta.url).pathname;

const session = new Session('client');
const pending = new Map();
let nextId = 1;
let child = null;

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

async function handleServerRequest(msg) {
  console.log('[client] request from server:', msg.method);

  if (msg.method !== 'sampling/createMessage') {
    child.stdin.write(
      encodeError(msg.id, ErrorCode.MethodNotFound, `Method not found: ${msg.method}`)
    );
    return;
  }

  if (!session.isReady()) {
    child.stdin.write(
      encodeError(msg.id, ErrorCode.InvalidRequest, 'Client not ready for sampling')
    );
    return;
  }

  try {
    console.log('[client] running local model for sampling/createMessage…');
    const result = await runSampling(msg.params ?? {});
    child.stdin.write(encodeResponse(msg.id, result));
    const preview =
      result.content.text.length > 200
        ? `${result.content.text.slice(0, 200)}…`
        : result.content.text;
    console.log('[client] sampling/createMessage → assistant text');
    console.log(`    text: ${preview}\n`);
  } catch (err) {
    const message = err?.message ?? 'Sampling handler failed';
    child.stdin.write(
      encodeError(msg.id, ErrorCode.InternalError, message)
    );
  }
}

function attachFramer() {
  createFramer(child.stdout, (line) => {
    let msg;
    try {
      msg = decode(line);
    } catch (err) {
      console.error('[client] could not decode:', line, err);
      return;
    }

    if (msg.type === MessageType.Request) {
      handleServerRequest(msg).catch((err) => {
        console.error('[client] server request handler error:', err);
      });
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
    }
  });
}

async function handshake() {
  console.log('[client] starting MCP handshake\n');

  const initResult = await send('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities:    { sampling: {} },
    clientInfo: {
      name:    'mcp-from-scratch-client',
      version: '0.1.0',
    },
  });
  session.onInitializeResult(initResult);

  console.log('initialize → server:', initResult.serverInfo?.name);
  console.log('  client declared:     sampling');
  console.log('  server capabilities: ', JSON.stringify(initResult.capabilities));

  notify('notifications/initialized', {});
  session.onInitializedSent();

  console.log('\n[client] handshake complete, session state:', session.state);
}

function printCallResult(toolName, result) {
  const text = result.content?.[0]?.text ?? JSON.stringify(result);
  console.log(`  tools/call → ${toolName}`);
  console.log(`    isError: ${result.isError === true}`);
  console.log(`    text:    ${text}\n`);
}

async function main() {
  console.log('[client] loading local model (first run may download ~1.5 GB)…\n');
  await initLlm();

  child = spawn(process.execPath, [serverPath], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`[client] server exited with code ${code}`);
    } else if (signal) {
      console.error(`[client] server killed by signal ${signal}`);
    }
  });

  attachFramer();

  try {
    await handshake();

    console.log('--- tools/list ---\n');

    const listResult = await send('tools/list', {});
    const names = (listResult.tools ?? []).map((t) => t.name).join(', ');
    console.log(
      `[client] tools/list → ${listResult.tools?.length ?? 0} tool(s): ${names}\n`
    );

    console.log('--- sampling via route_support_ticket ---\n');

    const routeResult = await send('tools/call', {
      name:      'route_support_ticket',
      arguments: {
        message:
          "I was double-charged on last month's invoice and need a refund.",
      },
    });
    printCallResult('route_support_ticket', routeResult);

    console.log('--- echo (no sampling) ---\n');

    const echoResult = await send('tools/call', {
      name:      'echo',
      arguments: { message: 'Sampling demo complete.' },
    });
    printCallResult('echo', echoResult);

    console.log('[client] done, closing connection');
    session.close();
    child.stdin.end();
  } finally {
    await disposeLlm();
    console.log('[client] local model disposed');
  }
}

main().catch((err) => {
  console.error('[client] unhandled error:', err);
  disposeLlm().finally(() => process.exit(1));
});
