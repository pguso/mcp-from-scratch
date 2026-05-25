// errors.js - JSON-RPC protocol errors vs tool execution errors (isError)
//
// MCP tools report failures in two different places on the wire:
//
//   1. Protocol errors  → JSON-RPC "error" object (request failed)
//   2. Tool errors        → CallToolResult with isError: true (call succeeded, tool failed)
//
// This module centralises both shapes so server handlers stay readable.
// Handlers throw protocol errors; they return tool errors.

import { ErrorCode } from '../../02-json-rpc/src/jsonrpc.js';

export { ErrorCode };

// ─── Protocol errors (JSON-RPC) ───────────────────────────────────────────────
//
// Throw these from tools/call validation or handlers when the *request* is wrong
// or the server cannot honour it. The dispatcher encodes them as:
//   { "jsonrpc": "2.0", "id": N, "error": { "code", "message", "data"? } }
//
// The client receives MessageType.Error - not a CallToolResult.

/**
 * Build a throwable protocol error. The dispatcher recognises { code, message }.
 *
 * @param {number} code
 * @param {string} message
 * @param {*} [data]
 * @returns {{ code: number, message: string, data?: * }}
 */
export function protocolError(code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return err;
}

/** @param {string} message @param {*} [data] */
export function invalidParams(message, data) {
  return protocolError(ErrorCode.InvalidParams, message, data);
}

/** @param {string} message @param {*} [data] */
export function internalError(message, data) {
  return protocolError(ErrorCode.InternalError, message, data);
}

/**
 * True when a caught value is a structured protocol error from protocolError().
 *
 * @param {*} err
 * @returns {boolean}
 */
export function isProtocolError(err) {
  return typeof err?.code === 'number' && typeof err?.message === 'string';
}

// ─── Tool results (CallToolResult) ────────────────────────────────────────────
//
// Return these from tool handlers when the call is valid but execution failed.
// The JSON-RPC layer still responds with "result" - the model reads content[].

/**
 * @param {string} text
 * @param {boolean} [isError]
 * @returns {{ content: object[], isError: boolean }}
 */
export function textResult(text, isError = false) {
  return {
    content: [{ type: 'text', text }],
    isError,
  };
}

/** Tool ran but failed - model can read the message and retry. */
export function toolError(text) {
  return textResult(text, true);
}

/** Tool succeeded. */
export function toolSuccess(text) {
  return textResult(text, false);
}

/**
 * Ensure a handler return value is a valid CallToolResult before sending.
 *
 * @param {*} result
 * @param {string} toolName - for error messages when the shape is wrong
 * @returns {{ content: object[], isError: boolean }}
 */
export function normalizeToolResult(result, toolName) {
  if (!result?.content || !Array.isArray(result.content)) {
    throw internalError(`Handler for "${toolName}" did not return a valid CallToolResult`);
  }
  return {
    content: result.content,
    isError: result.isError === true,
  };
}
