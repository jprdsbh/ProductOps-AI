'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RestoreButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function restore() {
    setLoading(true);
    try {
      // caminho relativo → mesmo domínio (rewrite) → cookie de sessão vai junto
      const res = await fetch(`/api/release-notes/${id}/restore`, {
        method: 'PATCH',
        credentials: 'include',
      });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={restore}
      disabled={loading}
      className="text-xs px-2.5 py-1 rounded-lg border border-green-300 dark:border-green-800 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition disabled:opacity-50"
      title="Tira da blacklist e volta para Pendentes"
    >
      {loading ? 'Restaurando...' : '↩ Restaurar'}
    </button>
  );
}
