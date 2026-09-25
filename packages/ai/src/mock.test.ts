import { describe, expect, it } from 'vitest';

import { MockChatModel, MockEmbeddingModel } from './mock.js';

const cosine = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i]!, 0);

describe('MockEmbeddingModel', () => {
  const model = new MockEmbeddingModel(128);

  it('is deterministic, unit-length and sized to its space', async () => {
    const [a, b] = await model.embed([
      'Vector search with pgvector',
      'Vector search with pgvector',
    ]);
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
  it('quotes the source that best matches the question and cites it', async () => {
    const answer = await new MockChatModel().complete([
      { role: 'system', content: 'Cite sources like [1].' },
      {
        role: 'user',
        content:
          '<sources>\n[1] Policy\nAsk your manager first.\n\n[2] Handbook\nLeave > Vacation\n\nVacation is 25 days per year.\n</sources>\n\nQuestion: How many vacation days?',
      },
    ]);
    expect(answer).toContain('"Vacation is 25 days per year." [2]');
    expect(answer).toContain('See also [1].');
  });

  it('says so when it was given no sources', async () => {
    const answer = await new MockChatModel().complete([{ role: 'user', content: 'Question: hi' }]);
    expect(answer).toMatch(/no sources/);
  });
});
