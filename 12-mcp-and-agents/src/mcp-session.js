// mcp-session.js - reusable MCP client: spawn server, handshake, list/call tools
//
// Extracted from the patterns in 05-tools-list and 06-tools-call clients.
// An agent host uses this instead of re-implementing JSON-RPC + lifecycle each time.

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createFramer } from '../../03-stdio-transport/src/framing.js';
import {
  encodeRequest,
  encodeNotification,
  decode,
  MessageType,
} from '../../02-json-rpc/src/jsonrpc.js';
import { Session, PROTOCOL_VERSION } from '../../04-lifecycle/src/session.js';

const DEFAULT_CLIENT_INFO = {
  name:    'mcp-from-scratch-agent',
  version: '0.1.0',
};

/**
 * @typedef {object} McpSession
 * @property {() => Promise<{ tools: object[] }>} listTools
 * @property {(name: string, args?: object) => Promise<object>} callTool
 * @property {() => void} close
 */

/**
 * Start an MCP server subprocess and complete the initialize handshake.
 *
 * @param {string} serverPath - absolute path to server.js
 * @param {object} [options]
 * @param {object} [options.clientInfo]
 * @returns {Promise<McpSession>}
 */
export async function createMcpSession(serverPath, options = {}) {
  const clientInfo = options.clientInfo ?? DEFAULT_CLIENT_INFO;

  const child = spawn(process.execPath, [serverPath], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  const session = new Session('client');
  const pending = new Map();
  let nextId = 1;

  createFramer(child.stdout, (line) => {
    let msg;
    try {
      msg = decode(line);
    } catch {
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

  const initResult = await send('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities:    {},
    clientInfo,
  });
  session.onInitializeResult(initResult);

  notify('notifications/initialized', {});
  session.onInitializedSent();

  return {
    async listTools() {
      return send('tools/list', {});
    },

    async callTool(name, args = {}) {
      return send('tools/call', { name, arguments: args });
    },

    close() {
      session.close();
      child.stdin.end();
    },
  };
}

/**
 * Default server from module 06 (echo, add, get_time).
 *
 * @returns {string}
 */
export function defaultServerPath() {
  return fileURLToPath(
    new URL('../../06-tools-call/src/server.js', import.meta.url)
  );
}

/**
 * Extract plain text from a CallToolResult.
 *
 * @param {object} result
 * @returns {string}
 */
export function textFromToolResult(result) {
  const blocks = result?.content ?? [];
  const parts = [];
  for (const block of blocks) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    }
  }
  return parts.join('\n') || '(empty tool result)';
}
