import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Release Notes',
  description: 'Atualizações do produto geradas com IA',
  icons: {
    icon: [{ url: '/favicon.ico?v=2', type: 'image/x-icon' }],
    shortcut: '/favicon.ico?v=2',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
