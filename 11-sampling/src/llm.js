// llm.js - local GGUF inference for MCP sampling/createMessage (host-side model)
//
// Loads unsloth/Qwen3.5-2B-GGUF (Q6_K) once via node-llama-cpp.

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
  thoughts:    'discourage',
});

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

function parseOptionalInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
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
 * Run one sampling/createMessage completion (stateless per request).
 *
 * @param {object} params - MCP sampling/createMessage params
 * @returns {Promise<{ role: string, content: object, model: string, stopReason: string }>}
 */
export async function runSampling(params) {
  if (context == null) {
    throw new Error('LLM not initialized; call initLlm() first');
  }

  const messages = Array.isArray(params?.messages) ? params.messages : [];
  let userText = '';

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role === 'user' && msg.content?.type === 'text') {
      userText = msg.content.text ?? '';
      break;
    }
  }

  const systemPrompt =
    typeof params?.systemPrompt === 'string' && params.systemPrompt.trim() !== ''
      ? params.systemPrompt
      : 'You write concise one-sentence summaries.';

  const maxTokens =
    typeof params?.maxTokens === 'number' && params.maxTokens > 0
      ? params.maxTokens
      : 120;

  chatSession.setChatHistory(
    chatWrapper.generateInitialChatHistory({ systemPrompt })
  );

  const meta = await chatSession.promptWithMeta(userText, {
    maxTokens,
    temperature: 0.3,
  });

  const text = extractAssistantText(meta);

  return {
    role: 'assistant',
    content: {
      type: 'text',
      text,
    },
    model:      MODEL_LABEL,
    stopReason: 'endTurn',
  };
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
