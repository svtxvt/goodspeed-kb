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
 * Answers with a quote from the first source and cites up to two sources. It
 * reads sources as blocks starting with a "[n] Title" line in the last user
 * message, which is how the API formats its context.
 */
export class MockChatModel implements ChatModel {
  async complete(messages: Message[]): Promise<string> {
    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    const sources = [
      ...(lastUser?.content ?? '').matchAll(/^\[(\d+)\][^\n]*\n([\s\S]*?)(?=\n\n\[\d+\]|\n<\/|$(?![\s\S]))/gm),
    ];
    const [first, second] = sources;
    if (!first) return 'Mock answer: there are no sources to answer from.';

    // Skip short lines such as the "Setup > Docker" heading path.
    const lines = first[2]!.split('\n').map((line) => line.trim()).filter(Boolean);
    const quote = (lines.find((line) => line.split(/\s+/).length >= 4) ?? lines[0] ?? '').slice(0, 160);
    const seeAlso = second ? ` See also [${second[1]}].` : '';
    return (
      `Mock answer (no language model is configured). ` +
      `The closest passage in your documents says: "${quote}" [${first[1]}].${seeAlso}`
    );
  }
}
