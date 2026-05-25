// llm.js - local GGUF inference for the module 12 agent loop
//
// Loads unsloth/Qwen3.5-2B-GGUF (Q6_K) once via node-llama-cpp and uses it for:
// 1. choosing one MCP tool call
// 2. writing the final user-facing answer from the tool result

import path from 'path';
import { fileURLToPath } from 'url';
import {
  getLlama,
  LlamaChatSession,
  QwenChatWrapper,
  resolveModelFile,
} from 'node-llama-cpp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_MODEL_URI = 'hf:unsloth/Qwen3.5-2B-GGUF:Q6_K';
const MODEL_LABEL = 'unsloth/Qwen3.5-2B-GGUF';

/** @type {import('node-llama-cpp').Llama | null} */
let llama = null;
/** @type {import('node-llama-cpp').LlamaModel | null} */
let model = null;
/** @type {import('node-llama-cpp').LlamaContext | null} */
let context = null;
/** @type {import('node-llama-cpp').LlamaChatSession | null} */
let chatSession = null;

const chatWrapper = new QwenChatWrapper({
  variation: '3.5',
  thoughts:  'discourage',
});

/**
 * @typedef {object} ToolCall
 * @property {string} name
 * @property {object} arguments
 */

function parseOptionalInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }

  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Prefer the visible answer; fall back to thought text when the token budget
 * expires before Qwen3.5 emits a non-thought reply.
 *
 * @param {{ responseText?: string, response?: unknown[] }} meta
 * @returns {string}
 */
function extractAssistantText(meta) {
  const visible = meta.responseText?.trim() ?? '';
  if (visible !== '') {
    return visible;
  }

  for (const item of meta.response ?? []) {
    if (item?.type === 'segment' && item.segmentType === 'thought' && item.text) {
      return item.text.trim();
    }
  }

  return (meta.response ?? [])
    .filter((item) => typeof item === 'string')
    .join('')
    .trim();
}

/**
 * @param {import('./tool-schema.js').ModelTool['parameters']} schema
 * @returns {object}
 */
function normalizeArgsSchema(schema) {
  if (schema == null || typeof schema !== 'object' || Array.isArray(schema)) {
    return {
      type:       'object',
      properties: {},
    };
  }

  if (schema.type == null) {
    return {
      type: 'object',
      ...schema,
    };
  }

  return schema;
}

/**
 * @param {import('./tool-schema.js').ModelTool[]} availableTools
 * @returns {object}
 */
function buildToolChoiceSchema(availableTools) {
  const variants = availableTools.map((tool) => ({
    type: 'object',
    properties: {
      name:      { const: tool.name },
      arguments: normalizeArgsSchema(tool.parameters),
    },
    required:             ['name', 'arguments'],
    additionalProperties: false,
  }));

  if (variants.length === 1) {
    return variants[0];
  }

  return { oneOf: variants };
}

/**
 * @param {import('./tool-schema.js').ModelTool[]} availableTools
 * @returns {string}
 */
function describeTools(availableTools) {
  return availableTools
    .map((tool) => {
      const description = tool.description?.trim() || '(no description)';
      const parameters = JSON.stringify(normalizeArgsSchema(tool.parameters));
      return `- ${tool.name}: ${description}\n  input schema: ${parameters}`;
    })
    .join('\n');
}

/**
 * @param {ToolCall} toolCall
 * @param {import('./tool-schema.js').ModelTool[]} availableTools
 * @returns {ToolCall}
 */
function validateToolCall(toolCall, availableTools) {
  if (toolCall == null || typeof toolCall !== 'object' || Array.isArray(toolCall)) {
    throw new Error('LLM returned a non-object tool call');
  }

  const tool = availableTools.find((candidate) => candidate.name === toolCall.name);
  if (!tool) {
    throw new Error(`LLM chose unknown tool "${toolCall.name}"`);
  }

  const args =
    toolCall.arguments != null &&
    typeof toolCall.arguments === 'object' &&
    !Array.isArray(toolCall.arguments)
      ? toolCall.arguments
      : {};

  return {
    name:      tool.name,
    arguments: args,
  };
}

function getSession() {
  if (llama == null || chatSession == null) {
    throw new Error('LLM not initialized; call initLlm() first');
  }

  return { llama, chatSession };
}

export function modelLabel() {
  return MODEL_LABEL;
}

/**
 * Download (if needed) and load the GGUF model.
 */
export async function initLlm() {
  if (context != null) {
    return;
  }

  const modelUri = process.env.GGUF_MODEL ?? DEFAULT_MODEL_URI;
  const modelsDir = path.join(__dirname, '../../models');
  const contextSize = parseOptionalInt('LLM_CONTEXT_SIZE', 4096);
  const gpuLayers = parseOptionalInt('LLM_GPU_LAYERS', -1);

  console.log('[llm] resolving model:', modelUri);
  console.log('[llm] models directory:', modelsDir);

  const modelPath = await resolveModelFile(modelUri, modelsDir);

  llama = await getLlama();
  const loadOptions = { modelPath };
  if (gpuLayers >= 0) {
    loadOptions.gpuLayers = gpuLayers;
  }

  model = await llama.loadModel(loadOptions);
  context = await model.createContext({ contextSize });
  chatSession = new LlamaChatSession({
    contextSequence: context.getSequence(),
    chatWrapper,
  });

  console.log('[llm] model ready:', MODEL_LABEL, '\n');
}

/**
 * Ask the local model to pick exactly one MCP tool call.
 *
 * @param {string} userGoal
 * @param {import('./tool-schema.js').ModelTool[]} availableTools
 * @returns {Promise<ToolCall>}
 */
export async function chooseTool(userGoal, availableTools) {
  const { llama: currentLlama, chatSession: session } = getSession();

  if (availableTools.length === 0) {
    throw new Error('No tools available for the local LLM to choose from');
  }

  const grammar = await currentLlama.createGrammarForJsonSchema(
    buildToolChoiceSchema(availableTools)
  );

  const systemPrompt =
    'You are the planning step in a tool-using MCP host. ' +
    'Choose exactly one available tool call that best helps with the user goal. ' +
    'If the goal mentions a tool by name and that tool can directly demonstrate its behavior, prefer using that tool. ' +
    'Return only the JSON object that matches the schema.';

  const prompt =
    `User goal:\n${userGoal}\n\n` +
    `Available tools:\n${describeTools(availableTools)}\n\n` +
    'Return the best single tool call as JSON.';

  session.setChatHistory(
    chatWrapper.generateInitialChatHistory({ systemPrompt })
  );

  const meta = await session.promptWithMeta(prompt, {
    grammar,
    maxTokens:   240,
    temperature: 0,
  });

  const responseText = extractAssistantText(meta);
  const parsed = grammar.parse(responseText);

  return validateToolCall(parsed, availableTools);
}

/**
 * Ask the local model to turn the tool result into a user-facing answer.
 *
 * @param {string} userGoal
 * @param {ToolCall} toolCall
 * @param {string} toolResultText
 * @param {boolean} [isToolError]
 * @returns {Promise<string>}
 */
export async function finalAnswer(userGoal, toolCall, toolResultText, isToolError = false) {
  const { chatSession: session } = getSession();

  const systemPrompt =
    'You are the final answer step in a tool-using MCP host. ' +
    'Answer the user using the tool result you were given. ' +
    'Stay concise, accurate, and grounded in the tool output. ' +
    'If the tool failed, explain the failure plainly.';

  const prompt =
    `User goal:\n${userGoal}\n\n` +
    `Chosen tool:\n${toolCall.name}\n\n` +
    `Tool arguments:\n${JSON.stringify(toolCall.arguments)}\n\n` +
    `Tool status:\n${isToolError ? 'error' : 'success'}\n\n` +
    `Tool result:\n${toolResultText}\n`;

  session.setChatHistory(
    chatWrapper.generateInitialChatHistory({ systemPrompt })
  );

  const meta = await session.promptWithMeta(prompt, {
    maxTokens:   160,
    temperature: 0.2,
  });

  return extractAssistantText(meta);
}

export async function disposeLlm() {
  if (chatSession != null) {
    chatSession.dispose();
    chatSession = null;
  }
  if (context != null) {
    await context.dispose();
    context = null;
  }
  if (model != null) {
    await model.dispose();
    model = null;
  }
  if (llama != null) {
    await llama.dispose();
    llama = null;
  }
}
