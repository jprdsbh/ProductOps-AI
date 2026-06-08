import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';

// Esconde TODO o /admin dos buscadores (não indexar, não seguir links).
export const metadata: Metadata = {
  title: 'Admin — TamboretePay',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

function TPayLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 480" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M441.523 94.7973H38.4769V133.275H441.523V94.7973Z" fill="currentColor" />
      <path d="M38.4769 205.09H209.257L77.8533 336.493L105.052 363.692L222.832 245.913V423.681H261.309V245.913L379.089 363.692L406.288 336.493L274.884 205.09H441.523V166.612H38.4769V205.09Z" fill="currentColor" />
      <path d="M480 56.3188H441.523V94.7973L480 94.7968V56.3188Z" fill="currentColor" />
      <path d="M38.478 56.3188H0V94.7968L38.4769 94.7973L38.478 56.3188Z" fill="currentColor" />
    </svg>
  );
}

const NAV = [
  { href: '/admin', label: 'Pendentes', icon: '📋' },
  { href: '/admin/published', label: 'Publicados', icon: '✅' },
  { href: '/admin/rejected', label: 'Reprovadas', icon: '🚫' },
  { href: '/admin/subscribers', label: 'Assinantes', icon: '📧' },
  { href: '/admin/tbot', label: 'TBot', icon: '🤖' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Sem sessão (ex.: tela de login) → não renderiza o menu admin.
  // As rotas em si já são protegidas pelo middleware; isso evita expor a
  // navegação/estrutura antes do login.
  const token = (await cookies()).get('access_token')?.value;
  if (!token) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Barra dourada da marca */}
      <div className="h-1 w-full bg-[#DDC444]" />

      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2 font-bold text-sm">
              <TPayLogo className="w-5 h-5 text-[#DDC444]" />
              <span>TamboretePay</span>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span className="text-gray-500 font-medium">Admin</span>
            </span>
            <nav className="flex gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:text-[#8B7A0A] hover:bg-[#DDC444]/15 transition flex items-center gap-1.5"
                >
                  <span className="text-xs">{item.icon}</span> {item.label}
                </Link>
              ))}
              <Link
                href="/changelog"
                target="_blank"
                className="text-sm px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                Changelog ↗
              </Link>
            </nav>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="text-xs font-medium text-gray-500 hover:text-red-600 border border-transparent hover:border-red-200 px-2.5 py-1 rounded-lg transition"
            >
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
