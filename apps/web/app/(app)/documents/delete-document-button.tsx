'use client';

import { useRef } from 'react';
import { useFormStatus } from 'react-dom';

import { deleteDocument } from './actions';

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-danger">
      {pending ? 'Deleting…' : 'Delete'}
    </button>
  );
}

/** A native modal <dialog>: focus is trapped while open and Escape cancels. */
export function DeleteDocumentButton({ id, title }: { id: string; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="btn-secondary text-red-700"
      >
        Delete…
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="delete-heading"
        aria-describedby="delete-description"
        className="m-auto max-w-md rounded-lg p-6 shadow-xl backdrop:bg-slate-900/50"
      >
        <h2 id="delete-heading" className="text-lg font-semibold">
          Delete “{title}”?
        </h2>
        <p id="delete-description" className="mt-2 text-sm text-slate-700">
          The document and its search index are removed. This cannot be undone.
        </p>
        <form action={deleteDocument} className="mt-6 flex justify-end gap-3">
          <input type="hidden" name="id" value={id} />
          <button type="button" onClick={() => dialog.current?.close()} className="btn-secondary">
            Cancel
          </button>
          <ConfirmButton />
        </form>
      </dialog>
    </>
  );
}
