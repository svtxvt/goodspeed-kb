import { type AIConfig, parseAIConfig } from '@kb/ai';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  SUPABASE_URL: z.url(),
  /** Publishable (or legacy anon) key. The caller's JWT decides what it can do. */
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  RAG_MATCH_COUNT: z.coerce.number().int().min(1).max(20).default(6),
  /** Depends on the embedding model: calibrate it when you change models. */
  RAG_MIN_SIMILARITY: z.coerce.number().min(-1).max(1).optional(),
});

export interface AppConfig {
  port: number;
  supabase: { url: string; publishableKey: string };
  rag: { matchCount: number; minSimilarity: number };
  ai: AIConfig;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/** Loads apps/api/.env (if present) into process.env without overriding real env vars. */
export function loadEnvFile(path = '.env'): void {
  try {
    process.loadEnvFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Validates the environment once at boot; fails with every problem listed. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const present = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const parsed = envSchema.safeParse(present);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new ConfigError(
      `Invalid API configuration (see apps/api/.env.example):\n${problems.join('\n')}`,
    );
  }
  const values = parsed.data;
  const ai = parseAIConfig(env);
  // Lexical mock vectors score lower than real embeddings for the same match.
  const minSimilarity = values.RAG_MIN_SIMILARITY ?? (ai.mock ? 0.15 : 0.25);
  return {
    port: values.PORT,
    supabase: {
      url: values.SUPABASE_URL.replace(/\/+$/, ''),
      publishableKey: values.SUPABASE_PUBLISHABLE_KEY,
    },
    rag: { matchCount: values.RAG_MATCH_COUNT, minSimilarity },
    ai,
  };
}
