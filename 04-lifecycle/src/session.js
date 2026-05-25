// session.js - MCP session state machine
//
// MCP is stateful. Before any tools, resources, or prompts can be used, the
// client and server complete a three-step handshake:
//
//   1. Client → Server:  initialize (request)
//   2. Server → Client:  initialize result (response)
//   3. Client → Server:  notifications/initialized (notification)
//
// Until step 3 completes, the session is not READY. The server must reject
// normal requests; the client must not send them.
//
// This module tracks that state explicitly so the rules are visible in code
// rather than buried in if-statements scattered across server.js and client.js.

// ─── States ───────────────────────────────────────────────────────────────────

export const SessionState = {
  CREATED:       'CREATED',       // connection open, handshake not started
  INITIALIZING:  'INITIALIZING',  // initialize exchanged, awaiting notifications/initialized
  READY:         'READY',         // handshake complete, normal operation allowed
  CLOSED:        'CLOSED',        // session ended
};

// ─── Protocol version ─────────────────────────────────────────────────────────

// This repository teaches spec version 2025-11-25. We also accept 2025-06-18
// so clients using the older string still connect during learning exercises.
export const PROTOCOL_VERSION = '2025-11-25';

export const SUPPORTED_PROTOCOL_VERSIONS = [
  PROTOCOL_VERSION,
  '2025-06-18',
];

// ─── Session ──────────────────────────────────────────────────────────────────

/**
 * Tracks MCP lifecycle state for one side of a connection.
 *
 * @param {'server'|'client'} role - Which party owns this session object.
 */
export class Session {
  constructor(role = 'server') {
    this.role = role;
    this.state = SessionState.CREATED;

    // Populated during initialize (both sides store what they learned).
    this.negotiatedProtocolVersion = null;
    this.clientCapabilities = null;
    this.clientInfo = null;
    this.serverCapabilities = null;
    this.serverInfo = null;
  }

  // ─── Queries ────────────────────────────────────────────────────────────────

  isReady() {
    return this.state === SessionState.READY;
  }

  /**
   * Whether an incoming request may be handled right now.
   * Used by the server before dispatching to a handler.
   *
   * @param {string} method
   * @returns {boolean}
   */
  canAcceptRequest(method) {
    if (this.state === SessionState.CLOSED) return false;

    // The spec allows ping during initialization on both sides.
    if (method === 'ping') return true;

    if (this.role === 'server') {
      switch (this.state) {
        case SessionState.CREATED:
          return method === 'initialize';
        case SessionState.INITIALIZING:
          // Waiting for the client's notifications/initialized - no other requests.
          return false;
        case SessionState.READY:
          return true;
        default:
          return false;
      }
    }

    // Client role: we do not accept requests from the server in this module.
    return false;
  }

  /**
   * Whether an incoming notification may be handled right now.
   *
   * @param {string} method
   * @returns {boolean}
   */
  canAcceptNotification(method) {
    if (this.state === SessionState.CLOSED) return false;

    if (this.role === 'server') {
      if (this.state === SessionState.INITIALIZING) {
        return method === 'notifications/initialized';
      }
      if (this.state === SessionState.READY) {
        return true;
      }
      return false;
    }

    return false;
  }

  /**
   * Whether the client may send a request in the current state.
   *
   * @param {string} method
   * @returns {boolean}
   */
  canSendRequest(method) {
    if (this.state === SessionState.CLOSED) return false;
    if (method === 'ping') return this.state !== SessionState.CLOSED;

    switch (this.state) {
      case SessionState.CREATED:
        return method === 'initialize';
      case SessionState.INITIALIZING:
        return false;
      case SessionState.READY:
        return true;
      default:
        return false;
    }
  }

  /**
   * Build a JSON-RPC error object for a rejected request.
   *
   * @param {string} method
   * @returns {{ code: number, message: string }}
   */
  rejectionForRequest(method) {
    if (this.state === SessionState.CLOSED) {
      return { code: -32600, message: 'Session closed' };
    }
    if (this.state === SessionState.CREATED && method !== 'initialize') {
      return { code: -32600, message: 'Server not initialized: send initialize first' };
    }
    if (this.state === SessionState.INITIALIZING) {
      return { code: -32600, message: 'Server not ready: waiting for notifications/initialized' };
    }
    return { code: -32600, message: `Request not allowed in state ${this.state}` };
  }

  // ─── Server transitions ─────────────────────────────────────────────────────

  /**
   * Server received a valid initialize request. Move to INITIALIZING.
   *
   * @param {object} params - initialize params from the client.
   * @param {string} negotiatedVersion - protocol version both sides agreed on.
   */
  onInitializeRequest(params, negotiatedVersion) {
    if (this.state !== SessionState.CREATED) {
      throw { code: -32600, message: 'Initialize already called' };
    }
    this.negotiatedProtocolVersion = negotiatedVersion;
    this.clientCapabilities = params.capabilities ?? {};
    this.clientInfo = params.clientInfo ?? {};
    this.state = SessionState.INITIALIZING;
  }

  /**
   * Server received notifications/initialized. Handshake is complete.
   */
  onInitializedNotification() {
    if (this.state !== SessionState.INITIALIZING) {
      throw new Error(`notifications/initialized not expected in state ${this.state}`);
    }
    this.state = SessionState.READY;
  }

  // ─── Client transitions ─────────────────────────────────────────────────────

  /** Client is about to send initialize. */
  onInitializeSent() {
    if (this.state !== SessionState.CREATED) {
      throw new Error(`initialize sent in unexpected state ${this.state}`);
    }
    this.state = SessionState.INITIALIZING;
  }

  /**
   * Client received a successful initialize response.
   *
   * @param {object} result - initialize result from the server.
   */
  onInitializeResult(result) {
    if (this.state !== SessionState.INITIALIZING) {
      throw new Error(`initialize result in unexpected state ${this.state}`);
    }
    this.negotiatedProtocolVersion = result.protocolVersion;
    this.serverCapabilities = result.capabilities ?? {};
    this.serverInfo = result.serverInfo ?? {};
    // Still INITIALIZING until we send notifications/initialized.
  }

  /** Client sent notifications/initialized. */
  onInitializedSent() {
    if (this.state !== SessionState.INITIALIZING) {
      throw new Error(`initialized sent in unexpected state ${this.state}`);
    }
    this.state = SessionState.READY;
  }

  close() {
    this.state = SessionState.CLOSED;
  }
}

// ─── Protocol negotiation ─────────────────────────────────────────────────────

/**
 * Pick a protocol version both sides can use.
 *
 * The client sends the newest version it supports. The server responds with
 * the version it will use for this session - which must be one the client
 * also supports.
 *
 * @param {string} clientVersion - params.protocolVersion from initialize.
 * @returns {string} The negotiated version.
 * @throws {{ code: number, message: string }} If no compatible version exists.
 */
export function negotiateProtocolVersion(clientVersion) {
  if (typeof clientVersion !== 'string' || clientVersion === '') {
    throw { code: -32602, message: 'Invalid params: protocolVersion is required' };
  }
  if (SUPPORTED_PROTOCOL_VERSIONS.includes(clientVersion)) {
    return clientVersion;
  }
  throw {
    code: -32602,
    message: `Unsupported protocol version: ${clientVersion}`,
    data: { supported: SUPPORTED_PROTOCOL_VERSIONS },
  };
}
