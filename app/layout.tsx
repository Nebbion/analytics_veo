import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Villanovese Analytics',
  description: 'Analisi statistiche ASD Villanovese',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
