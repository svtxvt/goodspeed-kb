import { describe, expect, it } from 'vitest';

import { createChatModel, createEmbeddingModel, parseAIConfig } from './config.js';
import { AIConfigError } from './errors.js';
import { MockChatModel, MockEmbeddingModel } from './mock.js';
import { OpenAICompatibleChatModel, OpenAICompatibleEmbeddingModel } from './openai-compatible.js';

describe('parseAIConfig', () => {
  it('needs nothing else in mock mode', () => {
    const config = parseAIConfig({ AI_MOCK: 'true' });
    expect(config).toEqual({ mock: true });
    expect(createChatModel(config)).toBeInstanceOf(MockChatModel);
    expect(createEmbeddingModel(config)).toBeInstanceOf(MockEmbeddingModel);
  });

  it('configures chat and embeddings independently (Groq chat + OpenAI embeddings)', () => {
    const config = parseAIConfig({
      AI_CHAT_BASE_URL: 'https://api.groq.com/openai/v1',
      AI_CHAT_API_KEY: 'gsk_test',
      AI_CHAT_MODEL: 'llama-3.3-70b-versatile',
      AI_EMBEDDING_BASE_URL: 'https://api.openai.com/v1',
      AI_EMBEDDING_API_KEY: 'sk-test',
      AI_EMBEDDING_MODEL: 'text-embedding-3-small',
      AI_EMBEDDING_DIMENSIONS: '1536',
    });
    expect(config).toMatchObject({
      mock: false,
      chat: { baseURL: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
      embedding: { baseURL: 'https://api.openai.com/v1', dimensions: 1536 },
    });
    expect(createChatModel(config)).toBeInstanceOf(OpenAICompatibleChatModel);
    const embeddings = createEmbeddingModel(config);
    expect(embeddings).toBeInstanceOf(OpenAICompatibleEmbeddingModel);
    expect(embeddings.space).toEqual({
      id: 'api.openai.com/text-embedding-3-small:1536',
      dimensions: 1536,
    });
  });

  it('lets the operator name the embedding space; the dimension is always appended', () => {
    const config = parseAIConfig({
      AI_CHAT_BASE_URL: 'http://gpu-box:11434/v1',
      AI_CHAT_MODEL: 'llama3.2',
      AI_EMBEDDING_BASE_URL: 'http://gpu-box:11434/v1',
      AI_EMBEDDING_MODEL: 'nomic-embed-text',
      AI_EMBEDDING_DIMENSIONS: '768',
      AI_EMBEDDING_SPACE: 'nomic-embed-text-v1.5',
    });
    expect(createEmbeddingModel(config).space.id).toBe('nomic-embed-text-v1.5:768');
  });

  it('accepts a local server without an API key (Ollama)', () => {
    const config = parseAIConfig({
      AI_CHAT_BASE_URL: 'http://localhost:11434/v1',
      AI_CHAT_MODEL: 'llama3.2',
      AI_EMBEDDING_BASE_URL: 'http://localhost:11434/v1',
      AI_EMBEDDING_MODEL: 'nomic-embed-text',
      AI_EMBEDDING_DIMENSIONS: '768',
    });
    expect(config.mock).toBe(false);
    if (!config.mock) expect(config.chat.apiKey).toBeUndefined();
  });

  it('lists every missing variable at once, treating empty values as missing', () => {
    const run = () => parseAIConfig({ AI_MOCK: 'false', AI_CHAT_BASE_URL: '', AI_CHAT_MODEL: 'x' });
    expect(run).toThrow(AIConfigError);
    expect(run).toThrow(/AI_CHAT_BASE_URL: required unless AI_MOCK=true/);
    expect(run).toThrow(/AI_EMBEDDING_MODEL: required/);
    expect(run).toThrow(/AI_EMBEDDING_DIMENSIONS: required/);
  });

  it('rejects malformed values with the variable name', () => {
    expect(() =>
      parseAIConfig({ AI_MOCK: 'true', AI_CHAT_BASE_URL: 'not a url', AI_TIMEOUT_MS: '-1' }),
    ).toThrow(/AI_CHAT_BASE_URL:[\s\S]*AI_TIMEOUT_MS:/);
  });
});
