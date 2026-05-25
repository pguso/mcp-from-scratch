// registry.js - store MCP tool definitions
//
// A tool has two parts that live in different places:
//
//   1. Definition - name, description, inputSchema. This is what clients see
//      when they call tools/list. It tells the model what the tool does and
//      what arguments it accepts.
//
//   2. Implementation - the actual function that runs when tools/call arrives.
//      That belongs in module 06. This module only handles discovery.
//
// Keeping definitions in a registry keeps server.js focused on protocol wiring.
// When you add a tool, you register its schema here once.

// ─── Validation ───────────────────────────────────────────────────────────────

const NAME_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * @param {object} tool
 * @throws {{ code: number, message: string }}
 */
function validateDefinition(tool) {
  if (typeof tool !== 'object' || tool === null || Array.isArray(tool)) {
    throw { code: -32602, message: 'Invalid tool: must be an object' };
  }

  if (typeof tool.name !== 'string' || !NAME_PATTERN.test(tool.name)) {
    throw {
      code: -32602,
      message: 'Invalid tool: name must be 1–128 chars (A–Z, a–z, 0–9, _, -, .)',
    };
  }

  if (typeof tool.description !== 'string' || tool.description.trim() === '') {
    throw { code: -32602, message: 'Invalid tool: description is required' };
  }

  const schema = tool.inputSchema;
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    throw { code: -32602, message: 'Invalid tool: inputSchema must be a JSON Schema object' };
  }

  if (schema.type !== 'object') {
    throw { code: -32602, message: 'Invalid tool: inputSchema.type must be "object"' };
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * In-memory store of tool definitions keyed by name.
 */
export class ToolRegistry {
  constructor() {
    /** @type {Map<string, object>} */
    this._tools = new Map();
  }

  /**
   * Add or replace a tool definition.
   *
   * @param {object} definition - MCP Tool object (name, description, inputSchema, …).
   * @throws {{ code: number, message: string }}
   */
  register(definition) {
    validateDefinition(definition);

    // Return a shallow copy so callers cannot mutate internal state.
    const stored = { ...definition };
    if (definition.title) stored.title = definition.title;
    if (definition.annotations) stored.annotations = { ...definition.annotations };

    this._tools.set(definition.name, stored);
  }

  /**
   * All registered tools, sorted by name for stable tools/list output.
   *
   * @returns {object[]}
   */
  list() {
    return [...this._tools.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Look up one tool by name. Used in module 06 for tools/call.
   *
   * @param {string} name
   * @returns {object|undefined}
   */
  get(name) {
    return this._tools.get(name);
  }

  /** @returns {number} */
  get size() {
    return this._tools.size;
  }
}
