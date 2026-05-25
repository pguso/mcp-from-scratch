// server.js - MCP server that handles resources/list and resources/read
//
// Resources are read-only data identified by URI. The client discovers them
// with resources/list and fetches content with resources/read.
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
import { invalidParams } from '../../07-errors/src/errors.js';
import { ResourceRegistry } from './registry.js';

// MCP application error: resource URI not in resources/list
const RESOURCE_NOT_FOUND = -32002;

// ─── Server identity ──────────────────────────────────────────────────────────

const SERVER_INFO = {
  name:    'mcp-from-scratch',
  version: '0.1.0',
};

const SERVER_CAPABILITIES = {
  resources: { listChanged: true },
};

// ─── Demo resources ───────────────────────────────────────────────────────────
//
// Custom demo:// URIs keep this module self-contained (no disk paths to manage).
// Production servers often use file:// or https:// - see the spec URI schemes.

const registry = new ResourceRegistry();

registry.register(
  {
    uri:         'demo://glossary',
    name:        'glossary',
    title:       'MCP glossary',
    description: 'Short definitions of core MCP concepts.',
    mimeType:    'text/plain',
  },
  () => ({
    uri:      'demo://glossary',
    mimeType: 'text/plain',
    text: [
      'Host     - Application that runs the AI and connects to MCP servers.',
      'Client   - MCP connector inside the host; one per server connection.',
      'Server   - Your code; exposes tools, resources, and prompts.',
      'Tool     - Callable action (may have side effects).',
      'Resource - Read-only data identified by URI.',
    ].join('\n'),
  })
);

registry.register(
  {
    uri:         'demo://server-info',
    name:        'server-info',
    title:       'Server metadata',
    description: 'JSON snapshot of this teaching server.',
    mimeType:    'application/json',
  },
  () => ({
    uri:      'demo://server-info',
    mimeType: 'application/json',
    text: JSON.stringify(
      {
        name:    SERVER_INFO.name,
        version: SERVER_INFO.version,
        module:  '08-resources',
        time:    new Date().toISOString(),
      },
      null,
      2
    ),
  })
);

registry.register(
  {
    uri:         'demo://welcome',
    name:        'welcome',
    title:       'Welcome note',
    description: 'A short welcome message for the resources demo.',
    mimeType:    'text/markdown',
  },
  () => ({
    uri:      'demo://welcome',
    mimeType: 'text/markdown',
    text: '# Welcome to MCP resources\n\nResources are **read-only**. Use `resources/list` to discover them and `resources/read` to fetch content.',
  })
);

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

// ─── resources/list ───────────────────────────────────────────────────────────
//
// Params: { cursor?: string } - pagination optional; we return all resources.

dispatcher.register('resources/list', async (_params) => {
  return { resources: registry.list() };
});

// ─── resources/read ───────────────────────────────────────────────────────────
//
// Params: { uri: string }
// Result: { contents: ResourceContents[] }
//
// Unknown URI → -32002 (Resource not found). Missing uri → -32602.

dispatcher.register('resources/read', async (params) => {
  const uri = params?.uri;

  if (typeof uri !== 'string' || uri.trim() === '') {
    throw invalidParams('Invalid params: uri is required');
  }

  if (!registry.get(uri)) {
    throw {
      code:    RESOURCE_NOT_FOUND,
      message: 'Resource not found',
      data:    { uri },
    };
  }

  const block = await registry.read(uri);

  if (!block || typeof block !== 'object') {
    throw {
      code:    -32603,
      message: `Reader for "${uri}" did not return content`,
    };
  }

  const hasText = typeof block.text === 'string';
  const hasBlob = typeof block.blob === 'string';

  if (!hasText && !hasBlob) {
    throw {
      code:    -32603,
      message: `Reader for "${uri}" must return text or blob`,
    };
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
