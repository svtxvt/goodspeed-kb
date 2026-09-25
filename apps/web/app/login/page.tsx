import { AuthForm } from './auth-form';

export default function LoginPage() {
  return (
    <main id="main" className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="mb-1 text-2xl font-semibold">Knowledge Base</h1>
      <p className="mb-6 text-sm text-slate-600">Sign in to manage your documents and ask questions about them.</p>
      <AuthForm />
    </main>
  );
}
