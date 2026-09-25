'use server';

import { type ChatRequest, chatRequestSchema, type ChatResponseDto } from '@kb/shared';

import { api, errorMessage } from '@/lib/api';

export async function askQuestion(
  request: ChatRequest,
): Promise<ChatResponseDto | { error: string }> {
  const parsed = chatRequestSchema.safeParse(request);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    return await api<ChatResponseDto>('/chat', { method: 'POST', body: parsed.data });
  } catch (error) {
    return { error: errorMessage(error) };
  }
}
