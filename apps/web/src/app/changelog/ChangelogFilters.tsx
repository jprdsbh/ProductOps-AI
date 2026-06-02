'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

const CATEGORIES = [
  { value: '', label: 'Todos' },
  { value: 'feature', label: 'Nova funcionalidade' },
  { value: 'improvement', label: 'Melhoria' },
  { value: 'bugfix', label: 'Correção' },
  { value: 'security', label: 'Segurança' },
];

export default function ChangelogFilters({ total }: { total: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentCategory = params.get('category') ?? '';
  const currentSort = params.get('sort') ?? 'desc';

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => {
      router.push(`/changelog?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 mb-8 transition-opacity ${isPending ? 'opacity-60' : ''}`}>
      <span className="text-xs text-gray-400 font-medium uppercase tracking-wide mr-1">{total} atualizações</span>

      <div className="flex gap-1.5 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => update('category', cat.value)}
            className={`text-xs px-3 py-1.5 rounded-full border transition font-medium ${
              currentCategory === cat.value
                ? 'bg-[#DDC444] border-[#DDC444] text-gray-900'
                : 'bg-white border-gray-200 text-gray-600 hover:border-[#DDC444] hover:text-gray-900'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex gap-1.5">
        {[{ value: 'desc', label: 'Mais recentes' }, { value: 'asc', label: 'Mais antigas' }].map((s) => (
          <button
            key={s.value}
            onClick={() => update('sort', s.value)}
            className={`text-xs px-3 py-1.5 rounded-full border transition font-medium ${
              currentSort === s.value
                ? 'bg-gray-900 border-gray-900 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
