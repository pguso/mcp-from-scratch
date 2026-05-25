// tool-schema.js - convert MCP tool definitions into a model-facing shape
//
// MCP tools/list returns: { name, description, inputSchema }
// OpenAI-style tools use: { type: "function", function: { name, description, parameters } }
// Anthropic tool_use is similar: { name, description, input_schema }
//
// This module uses one neutral shape so the local LLM, provider examples, and README
// can refer to a single format.
// LangChain's @langchain/mcp-adapters performs the same translation when you use getTools().

/**
 * @typedef {object} ModelTool
 * @property {string} name
 * @property {string} description
 * @property {object} parameters - JSON Schema object (from MCP inputSchema)
 */

/**
 * Map one MCP Tool object to a provider-neutral tool definition.
 *
 * @param {object} mcpTool - entry from tools/list result.tools[]
 * @returns {ModelTool}
 */
export function mcpToolToModelTool(mcpTool) {
  return {
    name:        mcpTool.name,
    description: mcpTool.description ?? '',
    parameters:  mcpTool.inputSchema ?? { type: 'object', properties: {} },
  };
}

/**
 * Map the full tools/list result to an array for the LLM.
 *
 * @param {{ tools?: object[] }} listResult
 * @returns {ModelTool[]}
 */
export function mcpToolsToModelTools(listResult) {
  const tools = listResult?.tools ?? [];
  return tools.map(mcpToolToModelTool);
}

/**
 * OpenAI Chat Completions "tools" array shape (for reference in README).
 *
 * @param {ModelTool[]} modelTools
 * @returns {object[]}
 */
export function toOpenAiTools(modelTools) {
  return modelTools.map((t) => ({
    type:     'function',
    function: {
      name:        t.name,
      description: t.description,
      parameters:  t.parameters,
    },
  }));
}
