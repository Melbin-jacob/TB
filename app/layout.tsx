import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Grocery Sale Optimizer',
  description: 'Compare local grocery flyer prices and plan the cheapest one- or two-store trip.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-CA">
      <body>{children}</body>
    </html>
  );
}
