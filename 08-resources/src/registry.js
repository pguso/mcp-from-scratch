// registry.js - store MCP resource definitions and content readers
//
// A resource has two parts:
//
//   1. Definition - uri, name, description, mimeType. Returned by resources/list.
//      Tells the client what exists and how to refer to it.
//
//   2. Reader - function that loads content when resources/read arrives.
//      Unlike tools, reading must not cause side effects - only return data.
//
// Keeping definitions in a registry keeps server.js focused on protocol wiring.

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * @param {object} resource
 * @throws {{ code: number, message: string }}
 */
function validateDefinition(resource) {
  if (typeof resource !== 'object' || resource === null || Array.isArray(resource)) {
    throw { code: -32602, message: 'Invalid resource: must be an object' };
  }

  if (typeof resource.uri !== 'string' || resource.uri.trim() === '') {
    throw { code: -32602, message: 'Invalid resource: uri is required' };
  }

  if (typeof resource.name !== 'string' || resource.name.trim() === '') {
    throw { code: -32602, message: 'Invalid resource: name is required' };
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * In-memory store of resource definitions and their readers.
 */
export class ResourceRegistry {
  constructor() {
    /** @type {Map<string, object>} */
    this._definitions = new Map();
    /** @type {Map<string, () => object|Promise<object>>} */
    this._readers = new Map();
  }

  /**
   * Add or replace a resource.
   *
   * @param {object} definition - MCP Resource object (uri, name, …).
   * @param {() => object|Promise<object>} read - Returns a ResourceContents object.
   * @throws {{ code: number, message: string }}
   */
  register(definition, read) {
    validateDefinition(definition);

    if (typeof read !== 'function') {
      throw { code: -32602, message: 'Invalid resource: read handler must be a function' };
    }

    const stored = { ...definition };
    if (definition.title) stored.title = definition.title;
    if (definition.description) stored.description = definition.description;
    if (definition.mimeType) stored.mimeType = definition.mimeType;

    this._definitions.set(definition.uri, stored);
    this._readers.set(definition.uri, read);
  }

  /**
   * All registered resources, sorted by uri for stable resources/list output.
   *
   * @returns {object[]}
   */
  list() {
    return [...this._definitions.values()].sort((a, b) =>
      a.uri.localeCompare(b.uri)
    );
  }

  /**
   * @param {string} uri
   * @returns {object|undefined}
   */
  get(uri) {
    return this._definitions.get(uri);
  }

  /**
   * Load content for a resource URI.
   *
   * @param {string} uri
   * @returns {Promise<object>}
   */
  async read(uri) {
    const reader = this._readers.get(uri);
    if (!reader) {
      return null;
    }
    return reader();
  }

  /** @returns {number} */
  get size() {
    return this._definitions.size;
  }
}
