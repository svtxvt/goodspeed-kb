import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'Knowledge Base',
  description: 'Your documents, answerable.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Browser extensions (Grammarly, LanguageTool, dark-mode tools) add attributes
    // to <html> before hydration; this only silences mismatches on this element.
    <html lang="en" suppressHydrationWarning>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-white focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
