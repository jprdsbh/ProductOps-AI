import Link from 'next/link';
import { cookies } from 'next/headers';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Sem sessão (ex.: tela de login) → não renderiza o menu admin.
  // As rotas em si já são protegidas pelo middleware; isso evita expor a
  // navegação/estrutura antes do login.
  const token = (await cookies()).get('access_token')?.value;
  if (!token) {
    return <div className="min-h-screen bg-gray-50 dark:bg-gray-950">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-sm">TamboretePay · Admin</span>
            <nav className="flex gap-1">
              <Link
                href="/admin"
                className="text-sm px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                Pendentes
              </Link>
              <Link
                href="/admin/published"
                className="text-sm px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                Publicados
              </Link>
              <Link
                href="/admin/subscribers"
                className="text-sm px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                Assinantes
              </Link>
              <Link
                href="/admin/tbot"
                className="text-sm px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition flex items-center gap-1"
              >
                <span>🤖</span> TBot
              </Link>
              <Link
                href="/changelog"
                target="_blank"
                className="text-sm px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                Changelog ↗
              </Link>
            </nav>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white transition">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
