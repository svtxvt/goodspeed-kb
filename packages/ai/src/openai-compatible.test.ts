import { describe, expect, it } from 'vitest';

import { AIProviderError } from './errors.js';
import {
  EMBEDDING_BATCH_SIZE,
  OpenAICompatibleChatModel,
  OpenAICompatibleEmbeddingModel,
  validateEmbeddings,
} from './openai-compatible.js';

interface Recorded {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

/** A fetch stand-in that records requests and replies from a handler. */
function fakeFetch(reply: (body: Record<string, unknown>) => Response) {
  const calls: Recorded[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url: String(input), headers: new Headers(init?.headers), body });
    return reply(body);
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const endpoint = { apiKey: 'test-key', timeoutMs: 5_000, maxRetries: 0 };

describe('OpenAICompatibleChatModel', () => {
  it('posts to <baseURL>/chat/completions with the configured model and key', async () => {
    const { calls, fetch } = fakeFetch(() =>
      json(200, { choices: [{ index: 0, message: { role: 'assistant', content: 'Hi [1]' } }] }),
    );
    const model = new OpenAICompatibleChatModel({
      ...endpoint,
      baseURL: 'https://api.groq.com/openai/v1',
      model: 'llama-3.3-70b-versatile',
      fetch,
    });

    await expect(model.complete([{ role: 'user', content: 'Hello' }])).resolves.toBe('Hi [1]');
    expect(calls[0]!.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer test-key');
    expect(calls[0]!.body).toMatchObject({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('maps 429 and 5xx to "unavailable" and other 4xx to "rejected"', async () => {
    const statusModel = (status: number) =>
      new OpenAICompatibleChatModel({
        ...endpoint,
        baseURL: 'http://llm.test/v1',
        model: 'm',
        fetch: fakeFetch(() => json(status, { error: { message: 'nope' } })).fetch,
      });

    for (const [status, code] of [
      [429, 'unavailable'],
      [503, 'unavailable'],
      [401, 'rejected'],
      [404, 'rejected'],
    ] as const) {
      await expect(statusModel(status).complete([])).rejects.toMatchObject({
        name: 'AIProviderError',
        code,
      });
    }
  });

  it('treats an empty completion as an invalid response', async () => {
    const model = new OpenAICompatibleChatModel({
      ...endpoint,
      baseURL: 'http://llm.test/v1',
      model: 'm',
      fetch: fakeFetch(() => json(200, { choices: [{ message: { content: '' } }] })).fetch,
    });
    await expect(model.complete([])).rejects.toMatchObject({ code: 'invalid_response' });
  });
});

describe('OpenAICompatibleEmbeddingModel', () => {
  it('batches inputs, requests floats and returns vectors in input order', async () => {
    const { calls, fetch } = fakeFetch((body) => {
      const input = body.input as string[];
      // Reply in reverse order: the client must re-order by `index`.
      const data = input.map((text, index) => ({ index, embedding: [text.length, 1] })).reverse();
      return json(200, { data, model: 'e', usage: { prompt_tokens: 1, total_tokens: 1 } });
    });
    const model = new OpenAICompatibleEmbeddingModel({
      ...endpoint,
      baseURL: 'http://localhost:11434/v1',
      model: 'nomic-embed-text',
      dimensions: 2,
      fetch,
    });

    const texts = Array.from({ length: EMBEDDING_BATCH_SIZE + 3 }, (_, i) => 'x'.repeat(i + 1));
    const vectors = await model.embed(texts);

    expect(calls.map((call) => (call.body.input as string[]).length)).toEqual([
      EMBEDDING_BATCH_SIZE,
      3,
    ]);
    expect(calls[0]!.url).toBe('http://localhost:11434/v1/embeddings');
    expect(calls[0]!.body).toMatchObject({ model: 'nomic-embed-text', encoding_format: 'float' });
    expect(vectors.map((vector) => vector[0])).toEqual(texts.map((text) => text.length));
    expect(model.space).toEqual({ id: 'localhost:11434/nomic-embed-text:2', dimensions: 2 });
  });
});

describe('validateEmbeddings', () => {
  const item = (index: number, embedding: unknown) => ({ index, embedding });

  it('accepts a well-formed response and orders it by index', () => {
    expect(validateEmbeddings([item(1, [0, 1]), item(0, [1, 0])], 2, 2)).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it.each([
    ['a missing data array', undefined, 1, /missing data array/],
    ['too few vectors', [item(0, [1, 0])], 2, /expected 2 vectors, got 1/],
    ['a duplicate index', [item(0, [1, 0]), item(0, [0, 1])], 2, /duplicate index 0/],
    ['an out-of-range index', [item(5, [1, 0])], 1, /invalid or duplicate index 5/],
    ['a dimension mismatch', [item(0, [1, 0, 0])], 1, /got 3 dimensions .* has 2/],
    ['a NaN value', [item(0, [Number.NaN, 1])], 1, /non-finite/],
    ['a zero vector', [item(0, [0, 0])], 1, /zero vector/],
  ])('rejects %s', (_label, data, expectedCount, message) => {
    const run = () => validateEmbeddings(data, expectedCount, 2);
    expect(run).toThrow(AIProviderError);
    expect(run).toThrow(message);
  });
});
