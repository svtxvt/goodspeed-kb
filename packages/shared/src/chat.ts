import { z } from 'zod';

export const CHAT_LIMITS = {
  questionMax: 2_000,
  historyMessagesMax: 20,
  historyMessageMax: 4_000,
} as const;

export const chatHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(CHAT_LIMITS.historyMessageMax),
});

/**
 * The client owns the session history and sends it with every question. Only
 * user/assistant turns are accepted; the server builds the system prompt.
 */
export const chatRequestSchema = z.object({
  /**
   * The user this client-side history belongs to. The API rejects the request
   * when the token is someone else's (e.g. an old tab after an account switch),
   * so one user's history is never sent under another user's session.
   */
  userId: z.uuid(),
  question: z.string().trim().min(1, 'Ask a question').max(CHAT_LIMITS.questionMax),
  history: z.array(chatHistoryMessageSchema).max(CHAT_LIMITS.historyMessagesMax).default([]),
});

export type ChatHistoryMessage = z.infer<typeof chatHistoryMessageSchema>;
export type ChatRequest = z.input<typeof chatRequestSchema>;

export interface CitationDto {
  /** The [n] marker used in the answer text. */
  n: number;
  documentId: string;
  documentTitle: string;
  excerpt: string;
}

export interface ChatResponseDto {
  answer: string;
  /** Only sources the answer actually cites, validated against what was retrieved. */
  citations: CitationDto[];
  /** False when nothing relevant was retrieved and the model was not called. */
  grounded: boolean;
}
