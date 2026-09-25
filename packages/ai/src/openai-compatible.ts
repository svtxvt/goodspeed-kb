import OpenAI from 'openai';

import { AIProviderError } from './errors.js';
import type { ChatModel, EmbeddingModel, EmbeddingSpace, Message } from './types.js';

/** Anything that speaks the OpenAI HTTP API: OpenAI, Groq, Together, OpenRouter, Ollama, vLLM... */
export interface EndpointConfig {
  baseURL: string;
  /** Optional: local servers such as Ollama need none. */
  apiKey?: string;
  model: string;
  timeoutMs: number;
  /** Retries on connection errors, 408/409/429 and 5xx, with backoff (done by the SDK). */
  maxRetries: number;
  /** Injection point for tests. */
  fetch?: typeof fetch;
}

export interface EmbeddingEndpointConfig extends EndpointConfig {
  dimensions: number;
  /**
   * Overrides the "<host><path>/<model>" part of the space id, e.g. to declare that
   * two servers host the same model. The dimension is always appended.
   */
  spaceName?: string;
}

/** Many providers cap inputs per request well below OpenAI's 2048. */
export const EMBEDDING_BATCH_SIZE = 64;

function createClient(config: EndpointConfig): OpenAI {
  return new OpenAI({
    baseURL: config.baseURL,
    // Always pass a key explicitly: otherwise the SDK falls back to the
    // OPENAI_API_KEY env var and could send it to a different provider.
    apiKey: config.apiKey ?? 'not-set',
    timeout: config.timeoutMs,
    maxRetries: config.maxRetries,
    fetch: config.fetch,
  });
}

function toProviderError(error: unknown, endpoint: string): AIProviderError {
  if (error instanceof AIProviderError) return error;
  if (error instanceof OpenAI.APIConnectionError) {
    return new AIProviderError('unavailable', `Could not reach ${endpoint}: ${error.message}`, {
      cause: error,
    });
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status ?? 0;
    const code = status === 429 || status >= 500 ? 'unavailable' : 'rejected';
    return new AIProviderError(code, `${endpoint} responded ${status}: ${error.message}`, {
      cause: error,
    });
  }
  return new AIProviderError('invalid_response', `Unexpected error from ${endpoint}`, {
    cause: error,
  });
}

export class OpenAICompatibleChatModel implements ChatModel {
  readonly #client: OpenAI;
  readonly #model: string;
  readonly #endpoint: string;

  constructor(config: EndpointConfig) {
    this.#client = createClient(config);
    this.#model = config.model;
    this.#endpoint = `${config.baseURL} (${config.model})`;
  }

  async complete(messages: Message[]): Promise<string> {
    let completion: OpenAI.ChatCompletion;
    try {
      completion = await this.#client.chat.completions.create({
        model: this.#model,
        messages,
      });
    } catch (error) {
      throw toProviderError(error, this.#endpoint);
    }

    const text = completion.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new AIProviderError(
        'invalid_response',
        `${this.#endpoint} returned an empty completion`,
      );
    }
    return text;
  }
}

export class OpenAICompatibleEmbeddingModel implements EmbeddingModel {
  readonly space: EmbeddingSpace;
  readonly #client: OpenAI;
  readonly #model: string;
  readonly #endpoint: string;

  constructor(config: EmbeddingEndpointConfig) {
    this.#client = createClient(config);
    this.#model = config.model;
    this.#endpoint = `${config.baseURL} (${config.model})`;
    // Same model name on another endpoint is not guaranteed to be the same
    // model, so the normalized base URL (host + path) is part of the identity
    // unless the operator names the space.
    const url = new URL(config.baseURL);
    const endpoint = `${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
    const name = config.spaceName ?? `${endpoint}/${config.model}`;
    this.space = { id: `${name}:${config.dimensions}`, dimensions: config.dimensions };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
      let response: OpenAI.CreateEmbeddingResponse;
      try {
        response = await this.#client.embeddings.create({
          model: this.#model,
          input: batch,
          // The SDK defaults to base64, which several compatible servers do not implement.
          encoding_format: 'float',
        });
      } catch (error) {
        throw toProviderError(error, this.#endpoint);
      }
      vectors.push(...validateEmbeddings(response.data, batch.length, this.space.dimensions));
    }
    return vectors;
  }
}

/**
 * Never trust the shape of an embeddings response: a wrong count, order or
 * dimension would silently attach vectors to the wrong chunks.
 */
export function validateEmbeddings(
  data: unknown,
  expectedCount: number,
  dimensions: number,
): number[][] {
  const fail = (reason: string) =>
    new AIProviderError('invalid_response', `Invalid embeddings response: ${reason}`);

  if (!Array.isArray(data)) throw fail('missing data array');
  if (data.length !== expectedCount) {
    throw fail(`expected ${expectedCount} vectors, got ${data.length}`);
  }

  const vectors: number[][] = new Array<number[]>(expectedCount);
  data.forEach((item: { index?: unknown; embedding?: unknown } | null, position) => {
    // Providers return an `index` per item; results are placed by it, not by arrival order.
    const index = typeof item?.index === 'number' ? item.index : position;
    if (!Number.isInteger(index) || index < 0 || index >= expectedCount || vectors[index]) {
      throw fail(`invalid or duplicate index ${String(index)}`);
    }
    const embedding = item?.embedding;
    if (!Array.isArray(embedding)) throw fail(`item ${index} has no embedding array`);
    if (embedding.length !== dimensions) {
      throw fail(
        `got ${embedding.length} dimensions but the configured embedding space has ${dimensions}; ` +
          'set AI_EMBEDDING_DIMENSIONS to the model output size and run `pnpm reindex`',
      );
    }
    let sumOfSquares = 0;
    for (const value of embedding) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw fail(`item ${index} contains a non-finite value`);
      }
      sumOfSquares += value * value;
    }
    // Cosine similarity is undefined for a zero vector.
    if (sumOfSquares === 0) throw fail(`item ${index} is a zero vector`);
    vectors[index] = embedding as number[];
  });
  return vectors;
}
