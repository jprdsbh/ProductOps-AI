import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  let status: 'ok' | 'notfound' | 'error' | 'missing' = 'missing';

  if (searchParams.token) {
    try {
      const res = await fetch(`${API}/api/subscribers/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: searchParams.token }),
        cache: 'no-store',
      });
      const data = await res.json();
      status = data.status === 'unsubscribed' ? 'ok' : 'notfound';
    } catch {
      status = 'error';
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
      <div className="max-w-md w-full mx-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
        <div className="h-1 w-full bg-[#DDC444] -mt-10 rounded-t-2xl mb-8" />
        {status === 'ok' && (
          <>
            <p className="text-3xl mb-4">👋</p>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Inscrição cancelada</h1>
            <p className="text-gray-500 text-sm">Você não receberá mais notificações do TamboretePay Changelog.</p>
          </>
        )}
        {status === 'notfound' && (
          <>
            <p className="text-3xl mb-4">🤔</p>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Link inválido</h1>
            <p className="text-gray-500 text-sm">Este link de cancelamento não é válido ou já foi utilizado.</p>
          </>
        )}
        {(status === 'error' || status === 'missing') && (
          <>
            <p className="text-3xl mb-4">⚠️</p>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Algo deu errado</h1>
            <p className="text-gray-500 text-sm">Link de cancelamento inválido ou ausente.</p>
          </>
        )}
        <Link href="/changelog" className="mt-6 inline-block text-sm text-gray-400 hover:text-gray-700 transition">
          ← Voltar ao Changelog
        </Link>
      </div>
    </div>
  );
}
