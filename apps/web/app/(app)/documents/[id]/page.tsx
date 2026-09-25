import type { DocumentDto } from '@kb/shared';
import { notFound } from 'next/navigation';

import { api, ApiError } from '@/lib/api';

import { DeleteDocumentButton } from '../delete-document-button';
import { DocumentForm } from '../document-form';

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);

  let document: DocumentDto;
  try {
    document = await api<DocumentDto>(`/documents/${id}`);
  } catch (error) {
    // 404 for a missing id and for someone else's document alike (RLS hides it).
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Edit document</h1>
        <DeleteDocumentButton id={document.id} title={document.title} />
      </div>
      {saved && (
        <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Saved and indexed (version {document.version}).
        </p>
      )}
      {/* Remount on a new version so the form shows what was just saved. */}
      <DocumentForm key={`${document.id}:${document.version}`} document={document} />
    </div>
  );
}
