// jsonrpc.js - encode and decode JSON-RPC 2.0 messages
//
// This module is pure: no I/O, no side effects, no state.
// Every function takes data in and returns data (or throws) out.
// Nothing here knows about stdin, stdout, or MCP.

// ─── Constants ───────────────────────────────────────────────────────────────

// Every JSON-RPC message must carry exactly this string.
// Using a constant avoids typos and makes grep-ability easy.
export const JSONRPC_VERSION = '2.0';

// Pre-defined error codes from the JSON-RPC 2.0 specification.
// The range -32768 to -32000 is reserved for the spec. MCP adds its own
// codes outside this range for application-level errors.
export const ErrorCode = {
  ParseError:     -32700, // The JSON could not be parsed at all
  InvalidRequest: -32600, // The JSON was parsed but is not a valid request object
  MethodNotFound: -32601, // The method does not exist or is not available
  InvalidParams:  -32602, // The method exists but the params are wrong
  InternalError:  -32603, // Something went wrong inside the handler
};

// ─── Message types ────────────────────────────────────────────────────────────

// These string constants let callers write `msg.type === MessageType.Request`
// instead of `msg.type === 'request'`. Avoids magic strings in downstream code.
export const MessageType = {
  Request:      'request',
  Response:     'response',
  Notification: 'notification',
  Error:        'error',
};

// ─── Encoding ─────────────────────────────────────────────────────────────────
// Each encode* function returns a JSON string ready to write to the wire.
// The '\n' at the end is the newline delimiter required by the stdio transport.
// It lives here rather than in the transport layer so the transport never has
// to think about message framing - it just writes what it is given.

/**
 * Encode a request.
 *
 * @param {number|string} id     - Caller-chosen identifier. The response will carry the same id.
 * @param {string}        method - The method name, e.g. "tools/list".
 * @param {object}        params - Arguments for the method. Defaults to {}.
 * @returns {string} A single JSON line ending with '\n'.
 */
export function encodeRequest(id, method, params = {}) {
  return JSON.stringify({ jsonrpc: JSONRPC_VERSION, id, method, params }) + '\n';
}

/**
 * Encode a successful response.
 *
 * @param {number|string} id     - Must match the id of the request being answered.
 * @param {*}             result - The return value. Any JSON-serialisable value.
 * @returns {string} A single JSON line ending with '\n'.
 */
export function encodeResponse(id, result) {
  return JSON.stringify({ jsonrpc: JSONRPC_VERSION, id, result }) + '\n';
}

/**
 * Encode an error response.
 *
 * @param {number|string|null} id      - The request id, or null if the request could not be parsed.
 * @param {number}             code    - An integer error code (use ErrorCode constants above).
 * @param {string}             message - Short human-readable description.
 * @param {*}                  [data]  - Optional additional context for the caller.
 * @returns {string} A single JSON line ending with '\n'.
 */
export function encodeError(id, code, message, data) {
  const error = data !== undefined ? { code, message, data } : { code, message };
  return JSON.stringify({ jsonrpc: JSONRPC_VERSION, id, error }) + '\n';
}

/**
 * Encode a notification.
 *
 * Notifications have no id. The receiver must not send a response.
 *
 * @param {string} method - The notification method name, e.g. "notifications/initialized".
 * @param {object} params - Payload. Defaults to {}.
 * @returns {string} A single JSON line ending with '\n'.
 */
export function encodeNotification(method, params = {}) {
  return JSON.stringify({ jsonrpc: JSONRPC_VERSION, method, params }) + '\n';
}

// ─── Decoding ─────────────────────────────────────────────────────────────────

/**
 * Parse and classify a raw JSON string from the wire.
 *
 * Returns a plain object with a `type` property set to one of the MessageType
 * constants, plus the original fields from the JSON object. Callers switch on
 * `type` to handle each shape.
 *
 * Throws a structured error (with `code` and `message`) if the input is
 * malformed, so callers can send a proper JSON-RPC error response.
 *
 * @param {string} raw - A single line of JSON (trailing '\n' is fine).
 * @returns {{ type: string, id?: *, method?: string, params?: *, result?: *, error?: * }}
 * @throws {{ code: number, message: string }}
 */
export function decode(raw) {
  // Step 1: parse JSON. Any syntax error becomes a ParseError.
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    throw { code: ErrorCode.ParseError, message: 'Parse error' };
  }

  // Step 2: validate the envelope - must be an object with jsonrpc === "2.0".
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) {
    throw { code: ErrorCode.InvalidRequest, message: 'Invalid request: not an object' };
  }
  if (msg.jsonrpc !== JSONRPC_VERSION) {
    throw { code: ErrorCode.InvalidRequest, message: `Invalid request: jsonrpc must be "${JSONRPC_VERSION}"` };
  }

  // Step 3: classify by which fields are present.
  //
  // The decision tree from the README:
  //   has "method"?
  //     yes → has "id"?  → Request : Notification
  //     no  → has "result"?  → Response : ErrorResponse

  if ('method' in msg) {
    if (typeof msg.method !== 'string') {
      throw { code: ErrorCode.InvalidRequest, message: 'Invalid request: method must be a string' };
    }
    if ('id' in msg) {
      // Request: has method + id.
      return { type: MessageType.Request, id: msg.id, method: msg.method, params: msg.params ?? {} };
    } else {
      // Notification: has method, no id.
      return { type: MessageType.Notification, method: msg.method, params: msg.params ?? {} };
    }
  }

  if ('result' in msg) {
    // Successful response.
    return { type: MessageType.Response, id: msg.id, result: msg.result };
  }

  if ('error' in msg) {
    // Error response.
    return { type: MessageType.Error, id: msg.id, error: msg.error };
  }

  // None of the expected fields were present.
  throw { code: ErrorCode.InvalidRequest, message: 'Invalid request: missing method, result, or error' };
}

// ─── Quick demo ───────────────────────────────────────────────────────────────
// Run this file directly to see every encode/decode round-trip.
// Usage: node src/jsonrpc.js

if (process.argv[1] === new URL(import.meta.url).pathname) {
  console.log('=== 1. Wire format: JSON strings we send on stdin/stdout ===\n');

  const req  = encodeRequest(1, 'tools/list', {});
  const res  = encodeResponse(1, { tools: [] });
  const err  = encodeError(1, ErrorCode.MethodNotFound, 'Method not found');
  const note = encodeNotification('notifications/initialized', {});

  console.log('request:     ', req.trimEnd());
  console.log('response:    ', res.trimEnd());
  console.log('error:       ', err.trimEnd());
  console.log('notification:', note.trimEnd());

  console.log('\n=== 2. After decode(): same messages as typed objects (type = request | response | error | notification) ===\n');

  for (const line of [req, res, err, note]) {
    const msg = decode(line);
    console.log(`type=${msg.type.padEnd(12)}`, JSON.stringify(msg));
  }

  console.log('\n=== 3. Invalid input: decode() throws { code, message } (dispatcher turns these into error responses) ===\n');

  const badCases = [
    ['not json',          'not json at all'],
    ['wrong version',     '{"jsonrpc":"1.0","id":1,"method":"x"}'],
    ['array',             '[1,2,3]'],
    ['empty object',      '{}'],
  ];

  for (const [label, input] of badCases) {
    try {
      decode(input);
      console.log(`${label}: (no error - unexpected)`);
    } catch (e) {
      console.log(`${label}: code=${e.code} message="${e.message}"`);
    }
  }
}
