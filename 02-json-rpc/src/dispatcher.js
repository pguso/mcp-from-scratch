// dispatcher.js - route incoming JSON-RPC messages to registered handlers
//
// The dispatcher sits between the transport (which delivers raw strings) and
// the application (which handles specific methods). It has two responsibilities:
//
//   1. Classify each incoming message (using jsonrpc.decode).
//   2. Call the right handler, and for requests wrap the handler's result
//      in a proper response, or wrap any thrown error in a proper error response.
//
// Notifications are fire-and-forget: if no handler is registered, they are
// silently ignored. Requests without a handler get a MethodNotFound error back.

import {
  decode,
  encodeResponse,
  encodeError,
  MessageType,
  ErrorCode,
} from './jsonrpc.js';

export class Dispatcher {
  constructor() {
    // Map from method name → async handler function.
    // Handlers for requests receive (params) and return a result value.
    // Handlers for notifications receive (params) and return nothing useful.
    this._handlers = new Map();

    // When the dispatcher produces an output message (a response or error),
    // it calls this function with the encoded string. The transport layer sets
    // this during wiring - see the demo at the bottom of this file.
    this.onOutput = null;
  }

  // ─── Registration ───────────────────────────────────────────────────────────

  /**
   * Register a handler for a method name.
   *
   * The handler is called with the `params` object from the incoming message.
   * For requests, the handler's return value becomes the `result` in the
   * response. The handler may be async.
   *
   * Registering twice for the same method silently replaces the previous handler.
   *
   * @param {string}   method  - The method name to handle, e.g. "tools/list".
   * @param {Function} handler - async (params) => result
   */
  register(method, handler) {
    this._handlers.set(method, handler);
  }

  // ─── Dispatch ────────────────────────────────────────────────────────────────

  /**
   * Process one raw line from the wire.
   *
   * This is the only method the transport layer needs to call. It handles all
   * classification, routing, and output encoding internally.
   *
   * @param {string} raw - A single newline-delimited JSON string.
   */
  async dispatch(raw) {
    let msg;

    // Try to decode. If the JSON is invalid, send a ParseError response.
    // We use id=null because we could not extract an id from the broken input.
    try {
      msg = decode(raw);
    } catch (err) {
      this._send(encodeError(null, err.code, err.message));
      return;
    }

    // Route by message type.
    if (msg.type === MessageType.Request) {
      await this._handleRequest(msg);
    } else if (msg.type === MessageType.Notification) {
      await this._handleNotification(msg);
    }
    // Response and Error types come back from outbound requests we made.
    // The dispatcher in this module only acts as a server - it does not make
    // requests of its own - so we silently ignore them here.
    // Module 03 and beyond extend this when a client side is needed.
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  async _handleRequest(msg) {
    const handler = this._handlers.get(msg.method);

    if (!handler) {
      // The spec requires MethodNotFound when the method is not registered.
      this._send(encodeError(msg.id, ErrorCode.MethodNotFound, `Method not found: ${msg.method}`));
      return;
    }

    try {
      // Run the handler. await handles both sync and async handlers uniformly.
      const result = await handler(msg.params);
      this._send(encodeResponse(msg.id, result));
    } catch (err) {
      // Turn the thrown value into a JSON-RPC error response.
      // If the handler threw a structured { code, message } object, use it.
      // Otherwise fall back to InternalError with the error's message string.
      const code    = (typeof err?.code === 'number') ? err.code : ErrorCode.InternalError;
      const message = err?.message ?? 'Internal error';
      const data    = err?.data;
      this._send(encodeError(msg.id, code, message, data));
    }
  }

  async _handleNotification(msg) {
    const handler = this._handlers.get(msg.method);

    // Silently ignore notifications for methods we do not handle.
    // The spec says: "The receiver SHOULD NOT reply to a Notification."
    // Unhandled notifications are not errors - the sender did not ask for anything.
    if (!handler) return;

    try {
      await handler(msg.params);
    } catch {
      // Errors in notification handlers cannot be reported back to the sender
      // (there is nowhere to send the response), so we swallow them silently.
      // In a real implementation you would log them.
    }
  }

  _send(encoded) {
    if (typeof this.onOutput === 'function') {
      this.onOutput(encoded);
    }
  }
}

// ─── Quick demo ───────────────────────────────────────────────────────────────
// Run this file directly to see the dispatcher in action.
// Usage: node src/dispatcher.js

if (process.argv[1] === new URL(import.meta.url).pathname) {
  import('./jsonrpc.js').then(({ encodeRequest, encodeNotification }) => {
    const dispatcher = new Dispatcher();

    // Capture output instead of writing to stdout, so we can label it.
    const outputs = [];
    dispatcher.onOutput = (line) => outputs.push(line.trimEnd());

    // Register two handlers.
    dispatcher.register('tools/list', async (_params) => {
      return { tools: [{ name: 'echo', description: 'Returns its input', inputSchema: {} }] };
    });

    dispatcher.register('notifications/initialized', async (_params) => {
      console.log('  [notification received: notifications/initialized]');
    });

    // Build the scenario as a series of raw JSON lines.
    const scenario = [
      // A valid request.
      encodeRequest(1, 'tools/list', {}),
      // A request for a method that has no handler.
      encodeRequest(2, 'tools/call', { name: 'echo', arguments: { text: 'hello' } }),
      // A notification - no response expected.
      encodeNotification('notifications/initialized', {}),
      // Unparseable JSON.
      'this is not json\n',
      // Valid JSON but not a valid JSON-RPC message.
      '{"jsonrpc":"2.0","foo":"bar"}\n',
    ];

    console.log('=== Dispatcher demo ===\n');

    // Process all messages, then print the collected outputs.
    Promise.all(scenario.map(line => dispatcher.dispatch(line))).then(() => {
      console.log('\n--- Output messages ---\n');
      for (const out of outputs) {
        console.log(out);
      }
    });
  });
}
