import { z } from 'zod';

import { AIConfigError } from './errors.js';
import { MockChatModel, MockEmbeddingModel } from './mock.js';
import {
  type EmbeddingEndpointConfig,
  type EndpointConfig,
  OpenAICompatibleChatModel,
  OpenAICompatibleEmbeddingModel,
} from './openai-compatible.js';
import type { ChatModel, EmbeddingModel } from './types.js';

// Chat and embeddings are configured independently: several chat providers
// (Groq, for one) have no embeddings endpoint, and changing the chat model
// must not force a re-embed of every document.
const envSchema = z.object({
  AI_MOCK: z.stringbool().default(false),
  AI_CHAT_BASE_URL: z.url().optional(),
  AI_CHAT_API_KEY: z.string().optional(),
  AI_CHAT_MODEL: z.string().optional(),
  AI_EMBEDDING_BASE_URL: z.url().optional(),
  AI_EMBEDDING_API_KEY: z.string().optional(),
  AI_EMBEDDING_MODEL: z.string().optional(),
  AI_EMBEDDING_DIMENSIONS: z.coerce.number().int().min(1).max(16_000).optional(),
  AI_EMBEDDING_SPACE: z.string().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(2),
});

const REQUIRED_UNLESS_MOCK = [
  'AI_CHAT_BASE_URL',
  'AI_CHAT_MODEL',
  'AI_EMBEDDING_BASE_URL',
  'AI_EMBEDDING_MODEL',
  'AI_EMBEDDING_DIMENSIONS',
] as const;

export const MOCK_EMBEDDING_DIMENSIONS = 256;

export type AIConfig =
  | { mock: true }
  | {
      mock: false;
      chat: EndpointConfig;
      embedding: EmbeddingEndpointConfig;
    };

/** Parses AI_* variables. Throws AIConfigError listing every problem at once. */
export function parseAIConfig(env: Record<string, string | undefined>): AIConfig {
  // `KEY=` in a .env file means "not set".
  const present = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const parsed = envSchema.safeParse(present);
  const problems = parsed.success
    ? []
    : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

  if (parsed.success && !parsed.data.AI_MOCK) {
    for (const key of REQUIRED_UNLESS_MOCK) {
      if (parsed.data[key] === undefined) problems.push(`${key}: required unless AI_MOCK=true`);
    }
  }
  if (!parsed.success || problems.length > 0) {
    throw new AIConfigError(
      `Invalid AI configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
    );
  }

  const values = parsed.data;
  if (values.AI_MOCK) return { mock: true };

  const shared = { timeoutMs: values.AI_TIMEOUT_MS, maxRetries: values.AI_MAX_RETRIES };
  return {
    mock: false,
    chat: {
      ...shared,
      baseURL: values.AI_CHAT_BASE_URL!,
      apiKey: values.AI_CHAT_API_KEY,
      model: values.AI_CHAT_MODEL!,
    },
    embedding: {
      ...shared,
      baseURL: values.AI_EMBEDDING_BASE_URL!,
      apiKey: values.AI_EMBEDDING_API_KEY,
      model: values.AI_EMBEDDING_MODEL!,
      dimensions: values.AI_EMBEDDING_DIMENSIONS!,
      spaceName: values.AI_EMBEDDING_SPACE,
    },
  };
}

export function createChatModel(config: AIConfig): ChatModel {
  return config.mock ? new MockChatModel() : new OpenAICompatibleChatModel(config.chat);
}

export function createEmbeddingModel(config: AIConfig): EmbeddingModel {
  return config.mock
    ? new MockEmbeddingModel(MOCK_EMBEDDING_DIMENSIONS)
    : new OpenAICompatibleEmbeddingModel(config.embedding);
}
