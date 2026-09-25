'use client';

import { DOCUMENT_LIMITS, type DocumentDto } from '@kb/shared';
import Link from 'next/link';
import { useActionState, useState } from 'react';

import { saveDocument } from './actions';

/**
 * Inputs are controlled so a failed save (provider down, version conflict)
 * never loses the text the user typed.
 */
export function DocumentForm({ document }: { document?: DocumentDto }) {
  const [state, action, pending] = useActionState(saveDocument, {});
  const [title, setTitle] = useState(document?.title ?? '');
  const [tags, setTags] = useState(document?.tags.join(', ') ?? '');
  const [content, setContent] = useState(document?.content ?? '');
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5" noValidate>
      {document && (
        <>
          <input type="hidden" name="id" value={document.id} />
          <input type="hidden" name="version" value={document.version} />
        </>
      )}

      <div>
        <label htmlFor="title" className="label">
          Title
        </label>
        <input
          id="title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={DOCUMENT_LIMITS.titleMax}
          required
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? 'title-error' : undefined}
          className="input"
        />
        {errors.title && (
          <p id="title-error" className="field-error">
            {errors.title}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="tags" className="label">
          Tags <span className="font-normal text-slate-600">(optional, comma-separated)</span>
        </label>
        <input
          id="tags"
          name="tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="policy, hr"
          aria-invalid={Boolean(errors.tags)}
          aria-describedby={errors.tags ? 'tags-error' : undefined}
          className="input"
        />
        {errors.tags && (
          <p id="tags-error" className="field-error">
            {errors.tags}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="content" className="label">
          Content <span className="font-normal text-slate-600">(plain text or Markdown)</span>
        </label>
        <textarea
          id="content"
          name="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={18}
          aria-invalid={Boolean(errors.content)}
          aria-describedby={`content-count${errors.content ? ' content-error' : ''}`}
          className="input font-mono"
        />
        <p id="content-count" className="mt-1 text-xs text-slate-600">
          {content.length.toLocaleString('en-US')} / {DOCUMENT_LIMITS.contentMax.toLocaleString('en-US')}{' '}
          characters
        </p>
        {errors.content && (
          <p id="content-error" className="field-error">
            {errors.content}
          </p>
        )}
      </div>

      <div aria-live="polite">
        {state.error && (
          <div role="alert" className="alert">
            <p>{state.error}</p>
            {state.conflict && document && (
              <Link href={`/documents/${document.id}`} className="mt-1 inline-block underline">
                Reload the latest version (discards your edits)
              </Link>
            )}
          </div>
        )}
      </div>

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? 'Saving and indexing…' : 'Save'}
      </button>
    </form>
  );
}
