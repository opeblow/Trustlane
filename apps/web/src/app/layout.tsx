import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trustlane',
  description: 'Trusted commerce for AI agents.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;750&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
