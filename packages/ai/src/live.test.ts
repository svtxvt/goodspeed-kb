// Optional smoke test against a real provider. Skipped unless AI_TEST_* is set, e.g.
//   AI_TEST_BASE_URL=https://api.openai.com/v1 AI_TEST_API_KEY=sk-... \
//   AI_TEST_CHAT_MODEL=gpt-4o-mini AI_TEST_EMBEDDING_MODEL=text-embedding-3-small \
//   AI_TEST_EMBEDDING_DIMENSIONS=1536 pnpm --filter @kb/ai test
import { describe, expect, it } from 'vitest';

import { OpenAICompatibleChatModel, OpenAICompatibleEmbeddingModel } from './openai-compatible.js';

const env = process.env;
const endpoint = {
  baseURL: env.AI_TEST_BASE_URL ?? '',
  apiKey: env.AI_TEST_API_KEY,
  timeoutMs: 30_000,
  maxRetries: 2,
};

describe.skipIf(!env.AI_TEST_BASE_URL)('live provider', () => {
  it.skipIf(!env.AI_TEST_CHAT_MODEL)('completes a chat', async () => {
    const chat = new OpenAICompatibleChatModel({
      ...endpoint,
      model: env.AI_TEST_CHAT_MODEL ?? '',
    });
    const answer = await chat.complete([{ role: 'user', content: 'Reply with the word: pong' }]);
    expect(answer.toLowerCase()).toContain('pong');
  });

  it.skipIf(!env.AI_TEST_EMBEDDING_MODEL)('embeds with the configured dimensions', async () => {
    const dimensions = Number(env.AI_TEST_EMBEDDING_DIMENSIONS);
    const embeddings = new OpenAICompatibleEmbeddingModel({
      ...endpoint,
      model: env.AI_TEST_EMBEDDING_MODEL ?? '',
      dimensions,
    });
    const vectors = await embeddings.embed(['hello', 'world']);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(dimensions);
  });
});
