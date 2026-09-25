import { describe, expect, it } from 'vitest';

import { MockChatModel, MockEmbeddingModel } from './mock.js';

const cosine = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i]!, 0);

describe('MockEmbeddingModel', () => {
  const model = new MockEmbeddingModel(128);

  it('is deterministic, unit-length and sized to its space', async () => {
    const [a, b] = await model.embed(['Vector search with pgvector', 'Vector search with pgvector']);
    expect(a).toEqual(b);
    expect(a).toHaveLength(128);
    expect(Math.hypot(...a!)).toBeCloseTo(1, 10);
    expect(model.space).toEqual({ id: 'mock-hashed-bow:128', dimensions: 128 });
  });

  it('scores texts that share words above unrelated texts', async () => {
    const [query, related, unrelated] = await model.embed([
      'How does pgvector store embeddings?',
      'pgvector stores embeddings in a vector column.',
      'The office kitchen closes at six on Fridays.',
    ]);
    expect(cosine(query!, related!)).toBeGreaterThan(cosine(query!, unrelated!) + 0.3);
  });

  it('never returns a zero vector, even for text with no words', async () => {
    const [vector] = await model.embed(['?!']);
    expect(Math.hypot(...vector!)).toBeCloseTo(1, 10);
  });
});

describe('MockChatModel', () => {
  it('quotes and cites the sources it was given', async () => {
    const answer = await new MockChatModel().complete([
      { role: 'system', content: 'Cite sources like [1].' },
      {
        role: 'user',
        content: '[1] Handbook\nVacation is 25 days.\n\n[2] Policy\nAsk your manager.\n\nQuestion: ?',
      },
    ]);
    expect(answer).toContain('"Vacation is 25 days." [1]');
    expect(answer).toContain('See also [2].');
  });
});
