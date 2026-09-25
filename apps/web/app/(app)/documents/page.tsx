import type { DocumentSummaryDto } from '@kb/shared';
import Link from 'next/link';

import { api } from '@/lib/api';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const [{ deleted }, documents] = await Promise.all([
    searchParams,
    api<DocumentSummaryDto[]>('/documents'),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <Link href="/documents/new" className="btn-primary">
          New document
        </Link>
      </div>

      {deleted && (
        <p role="status" className="text-sm text-slate-700">
          Document deleted.
        </p>
      )}

      {documents.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-8 text-center text-slate-600">
          No documents yet. <Link href="/documents/new" className="underline">Create one</Link>, then ask
          questions about it.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <Link href={`/documents/${doc.id}`} className="font-medium hover:underline">
                {doc.title}
              </Link>
              {doc.tags.length > 0 && (
                <ul aria-label="Tags" className="flex gap-1">
                  {doc.tags.map((tag) => (
                    <li key={tag} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {tag}
                    </li>
                  ))}
                </ul>
              )}
              <span className="ml-auto text-xs text-slate-600">
                Updated <time dateTime={doc.updatedAt}>{formatDate(doc.updatedAt)}</time>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
