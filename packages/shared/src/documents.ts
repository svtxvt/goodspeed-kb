import { z } from 'zod';

export const DOCUMENT_LIMITS = {
  titleMax: 200,
  contentMax: 100_000,
  tagsMax: 20,
  tagMax: 40,
} as const;

const tagSchema = z.string().trim().toLowerCase().min(1).max(DOCUMENT_LIMITS.tagMax);

export const documentInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(DOCUMENT_LIMITS.titleMax, `Title must be at most ${DOCUMENT_LIMITS.titleMax} characters`),
  content: z
    .string()
    .max(
      DOCUMENT_LIMITS.contentMax,
      `Content must be at most ${DOCUMENT_LIMITS.contentMax.toLocaleString('en-US')} characters`,
    ),
  tags: z
    .array(tagSchema)
    .max(DOCUMENT_LIMITS.tagsMax, `At most ${DOCUMENT_LIMITS.tagsMax} tags`)
    .default([])
    .transform((tags) => [...new Set(tags)]),
});

/** PUT body: the full document plus the version the edit was based on. */
export const documentUpdateSchema = documentInputSchema.extend({
  version: z.int().positive(),
});

export type DocumentInput = z.input<typeof documentInputSchema>;
export type DocumentUpdate = z.input<typeof documentUpdateSchema>;

export interface DocumentDto {
  id: string;
  title: string;
  content: string;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSummaryDto {
  id: string;
  title: string;
  tags: string[];
  excerpt: string;
  updatedAt: string;
}

/** Splits a comma-separated tag field ("rag, notes") into a tag list. */
export function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}
