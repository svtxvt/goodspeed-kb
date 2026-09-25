import { DocumentForm } from '../document-form';

export default function NewDocumentPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New document</h1>
      <DocumentForm />
    </div>
  );
}
