// The whole application talks to AI through these two interfaces. They are
// deliberately smaller than any SDK: no SDK types leak out of this package, so
// swapping the implementation never touches application code.

export type Role = 'system' | 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}

export interface ChatModel {
  complete(messages: Message[]): Promise<string>;
}

/**
 * Vectors are only comparable when they come from the same model with the same
 * output size. `id` names that space (e.g. "text-embedding-3-small:1536") and is
 * stored next to every vector, so search never mixes spaces.
 */
export interface EmbeddingSpace {
  readonly id: string;
  readonly dimensions: number;
}

export interface EmbeddingModel {
  readonly space: EmbeddingSpace;
  /** Returns one vector per input, in input order. */
  embed(texts: string[]): Promise<number[][]>;
}
