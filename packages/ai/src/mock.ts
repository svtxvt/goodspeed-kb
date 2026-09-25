// Mock models: a test double, and the "no API key" mode for local demos.
// Retrieval with MockEmbeddingModel is real (lexical, via feature hashing);
// MockChatModel does not understand anything, it only points at sources.

import type { ChatModel, EmbeddingModel, EmbeddingSpace, Message } from './types.js';

const STOPWORDS = new Set(
  'a an and are as at be by can do does for from has have how i in is it its me my of on or so that the this to was what when where which who why will with you your'.split(
    ' ',
  ),
);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
    .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token));
}

/** 32-bit FNV-1a. */
function hash(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic bag-of-words embedding via the hashing trick: texts that share
 * words get similar vectors, so retrieval behaves sensibly without a model.
 */
export class MockEmbeddingModel implements EmbeddingModel {
  readonly space: EmbeddingSpace;

  constructor(dimensions = 256) {
    this.space = { id: `mock-hashed-bow:${dimensions}`, dimensions };
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.#embedOne(text));
  }

  #embedOne(text: string): number[] {
    const vector = new Array<number>(this.space.dimensions).fill(0);
    for (const token of tokenize(text)) {
      const h = hash(token);
      vector[h % this.space.dimensions]! += h & 0x80000000 ? -1 : 1;
    }
    const norm = Math.hypot(...vector);
    if (norm === 0) {
      vector[0] = 1; // cosine similarity is undefined for a zero vector
      return vector;
    }
    return vector.map((value) => value / norm);
  }
}

/**
 * Quotes the source that shares the most words with the question and cites it
 * (plus the runner-up). It reads sources as blocks starting with a "[n] Title"
 * line and the question after "Question:" in the last user message, which is
 * how the API formats its prompt.
 */
export class MockChatModel implements ChatModel {
  async complete(messages: Message[]): Promise<string> {
    const prompt = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    const question = new Set(tokenize(/Question:([\s\S]*)$/.exec(prompt)?.[1] ?? ''));
    const sources = [
      ...prompt.matchAll(/^\[(\d+)\][^\n]*\n([\s\S]*?)(?=\n\n\[\d+\]|\n<\/sources>|$(?![\s\S]))/gm),
    ]
      .map((match) => ({
        n: match[1]!,
        text: match[2]!,
        overlap: tokenize(match[2]!).filter((token) => question.has(token)).length,
      }))
      .sort((a, b) => b.overlap - a.overlap);

    const [best, runnerUp] = sources;
    if (!best) return 'Mock answer: there are no sources to answer from.';

    // Quote the first full sentence, skipping the "Setup > Docker" heading line.
    const lines = best.text.split('\n').map((line) => line.trim()).filter(Boolean);
    const quote = (lines.find((line) => /[.!?:]$/.test(line)) ?? lines[0] ?? '').slice(0, 160);
    const seeAlso = runnerUp ? ` See also [${runnerUp.n}].` : '';
    return (
      `Mock answer (no language model is configured). ` +
      `The closest passage in your documents says: "${quote}" [${best.n}].${seeAlso}`
    );
  }
}
