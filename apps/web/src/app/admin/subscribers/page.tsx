import { cookies } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:3002';

interface Subscriber { id: string; email: string; active: boolean; createdAt: string; }

async function getSubscribers(token: string): Promise<{ data: Subscriber[]; total: number }> {
  try {
    const res = await fetch(`${API}/api/subscribers?limit=100`, {
      headers: { Cookie: `access_token=${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return { data: [], total: 0 };
    return res.json();
  } catch {
    return { data: [], total: 0 };
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function SubscribersPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';
  const { data: subscribers, total } = await getSubscribers(token);
  const active = subscribers.filter((s) => s.active).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Assinantes do Changelog</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} cadastros · <span className="text-green-600 font-medium">{active} ativos</span>
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {subscribers.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="font-medium">Nenhum assinante ainda.</p>
            <p className="text-sm mt-1">O formulário de inscrição está no changelog público.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-400 font-medium">E-mail</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-400 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-400 font-medium">Inscrito em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {subscribers.map((sub) => (
                <tr key={sub.id}>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{sub.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${
                      sub.active
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {sub.active ? 'Ativo' : 'Cancelado'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(sub.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Os assinantes recebem e-mail automático quando um release é aprovado e publicado.
        Configure SMTP no arquivo <code className="bg-gray-100 px-1 rounded">.env</code> da API para ativar o envio.
      </p>
    </div>
  );
}
