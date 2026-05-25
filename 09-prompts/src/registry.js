// registry.js - store MCP prompt definitions and message resolvers
//
// A prompt has two parts:
//
//   1. Definition - name, description, arguments[]. Returned by prompts/list.
//   2. Resolver - function(args) → { description?, messages } for prompts/get.
//
// Prompts are user-controlled templates (not model-autonomous tool calls).

const NAME_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * @param {object} prompt
 * @throws {{ code: number, message: string }}
 */
function validateDefinition(prompt) {
  if (typeof prompt !== 'object' || prompt === null || Array.isArray(prompt)) {
    throw { code: -32602, message: 'Invalid prompt: must be an object' };
  }

  if (typeof prompt.name !== 'string' || !NAME_PATTERN.test(prompt.name)) {
    throw {
      code: -32602,
      message:
        'Invalid prompt: name must be 1–128 chars (A–Z, a–z, 0–9, _, -, .)',
    };
  }

  if (typeof prompt.description !== 'string' || prompt.description.trim() === '') {
    throw { code: -32602, message: 'Invalid prompt: description is required' };
  }

  if (prompt.arguments !== undefined) {
    if (!Array.isArray(prompt.arguments)) {
      throw { code: -32602, message: 'Invalid prompt: arguments must be an array' };
    }
    for (const arg of prompt.arguments) {
      if (typeof arg?.name !== 'string' || arg.name.trim() === '') {
        throw { code: -32602, message: 'Invalid prompt: each argument needs a name' };
      }
    }
  }
}

/**
 * @param {object[]} argDefs
 * @param {object} args
 * @throws {{ code: number, message: string }}
 */
function validateArguments(argDefs, args) {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw { code: -32602, message: 'Invalid params: arguments must be an object' };
  }

  for (const def of argDefs) {
    if (!def.required) continue;
    const value = args[def.name];
    if (value === undefined || value === null || value === '') {
      throw {
        code:    -32602,
        message: `Invalid params: missing required argument "${def.name}"`,
      };
    }
  }
}

export class PromptRegistry {
  constructor() {
    /** @type {Map<string, object>} */
    this._definitions = new Map();
    /** @type {Map<string, (args: object) => object|Promise<object>>} */
    this._resolvers = new Map();
  }

  /**
   * @param {object} definition
   * @param {(args: object) => object|Promise<object>} resolve
   */
  register(definition, resolve) {
    validateDefinition(definition);

    if (typeof resolve !== 'function') {
      throw { code: -32602, message: 'Invalid prompt: resolver must be a function' };
    }

    const stored = { ...definition };
    if (definition.title) stored.title = definition.title;
    if (definition.arguments) {
      stored.arguments = definition.arguments.map((a) => ({ ...a }));
    }

    this._definitions.set(definition.name, stored);
    this._resolvers.set(definition.name, resolve);
  }

  /** @returns {object[]} */
  list() {
    return [...this._definitions.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  /** @param {string} name */
  get(name) {
    return this._definitions.get(name);
  }

  /**
   * @param {string} name
   * @param {object} args
   */
  async resolve(name, args) {
    const def = this._definitions.get(name);
    if (!def) return null;

    const argDefs = def.arguments ?? [];
    validateArguments(argDefs, args ?? {});

    const resolver = this._resolvers.get(name);
    return resolver(args ?? {});
  }

  get size() {
    return this._definitions.size;
  }
}
