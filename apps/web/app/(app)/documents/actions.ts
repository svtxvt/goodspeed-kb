'use server';

import { type DocumentDto, documentInputSchema, parseTags } from '@kb/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { api, ApiError } from '@/lib/api';

export interface SaveState {
  error?: string;
  conflict?: boolean;
  fieldErrors?: Partial<Record<'title' | 'content' | 'tags', string>>;
}

function messageFor(error: ApiError): string {
  switch (error.body.error) {
    case 'version_conflict':
      return 'This document was changed somewhere else (another tab?). Your text is still below: copy what you need, then reload the latest version.';
    case 'ai_unavailable':
      return 'The AI provider is unavailable, so nothing was saved. Your text is still below; try again in a moment.';
    default:
      return error.message;
  }
}

export async function saveDocument(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const id = String(formData.get('id') ?? '');
  const parsed = documentInputSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
    tags: parseTags(String(formData.get('tags') ?? '')),
  });
  if (!parsed.success) {
    const fieldErrors: SaveState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof NonNullable<SaveState['fieldErrors']>;
      fieldErrors[field] ??= issue.message;
    }
    return { fieldErrors };
  }

  let saved: DocumentDto;
  try {
    saved = id
      ? await api<DocumentDto>(`/documents/${id}`, {
          method: 'PUT',
          body: { ...parsed.data, version: Number(formData.get('version')) },
        })
      : await api<DocumentDto>('/documents', { method: 'POST', body: parsed.data });
  } catch (error) {
    if (error instanceof ApiError)
      return { error: messageFor(error), conflict: error.status === 409 };
    throw error;
  }

  revalidatePath('/documents');
  redirect(`/documents/${saved.id}?saved=1`);
}

export async function deleteDocument(formData: FormData): Promise<void> {
  await api(`/documents/${String(formData.get('id'))}`, { method: 'DELETE' });
  revalidatePath('/documents');
  redirect('/documents?deleted=1');
}
