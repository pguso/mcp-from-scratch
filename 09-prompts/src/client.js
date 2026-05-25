// client.js - handshake, then prompts/list and prompts/get
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
    await sendUnchecked('prompts/list', {});
    console.log('prompts/list before init → unexpected success');
  } catch (err) {
    console.log('prompts/list before init → rejected (expected):', err.message);
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
    '  prompts capability:',
    JSON.stringify(initResult.capabilities?.prompts)
  );

  notify('notifications/initialized', {});
  session.onInitializedSent();

  console.log('\n[client] handshake complete, session state:', session.state);
}

function printPrompts(result) {
  const prompts = result.prompts ?? [];

  console.log(`\n[client] prompts/list → ${prompts.length} prompt(s)\n`);

  for (const prompt of prompts) {
    console.log(`  • ${prompt.name}`);
    if (prompt.title) {
      console.log(`    title:       ${prompt.title}`);
    }
    console.log(`    description: ${prompt.description}`);
    if (prompt.arguments?.length) {
      console.log('    arguments:');
      for (const arg of prompt.arguments) {
        const req = arg.required ? 'required' : 'optional';
        console.log(`      - ${arg.name} (${req})${arg.description ? `: ${arg.description}` : ''}`);
      }
    }
    console.log();
  }
}

function previewText(text, maxLen = 120) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen)}…`;
}

function printGetResult(label, result) {
  console.log(`  ${label}`);
  if (result.description) {
    console.log(`    description: ${result.description}`);
  }
  const messages = result.messages ?? [];
  for (const msg of messages) {
    console.log(`    role: ${msg.role}`);
    const text = msg.content?.text;
    if (typeof text === 'string') {
      console.log(`    text: ${previewText(text)}`);
    }
  }
  console.log();
}

function printGetError(label, err) {
  console.log(`  ${label}`);
  console.log(`    JSON-RPC error code:    ${err.code}`);
  console.log(`    JSON-RPC error message: ${err.message}`);
  if (err.data) {
    console.log(`    data:                   ${JSON.stringify(err.data)}`);
  }
  console.log();
}

async function getPrompt(label, params) {
  try {
    const result = await send('prompts/get', params);
    printGetResult(label, result);
    return { ok: true, result };
  } catch (err) {
    printGetError(label, err);
    return { ok: false, error: err };
  }
}

async function main() {
  await handshake();

  console.log('--- prompt discovery ---\n');

  const listResult = await send('prompts/list', {});
  printPrompts(listResult);

  console.log('--- fetch each prompt ---\n');

  await getPrompt('prompts/get → summarize', {
    name:      'summarize',
    arguments: {
      text: 'MCP prompts return messages, not tool results.',
    },
  });

  await getPrompt('prompts/get → code_review', {
    name:      'code_review',
    arguments: {
      code: "def hello():\n    print('world')",
    },
  });

  await getPrompt('prompts/get → explain_concept (default topic)', {
    name:      'explain_concept',
    arguments: {},
  });

  console.log('--- get errors ---\n');

  await getPrompt('unknown name → Invalid params (-32602)', {
    name: 'does_not_exist',
    arguments: {},
  });

  await getPrompt('missing required text → Invalid params (-32602)', {
    name:      'summarize',
    arguments: {},
  });

  console.log('[client] done, closing connection');
  session.close();
  child.stdin.end();
}

main().catch((err) => {
  console.error('[client] unhandled error:', err);
  process.exit(1);
});
