import Link from 'next/link';
import { cookies } from 'next/headers';
import { ReleaseNoteDto } from '@techdirector/shared';

const API = process.env.API_URL ?? 'http://localhost:3002';

async function getPublishedNotes(token: string): Promise<{ data: ReleaseNoteDto[]; total: number }> {
  try {
    const res = await fetch(`${API}/api/release-notes/public?limit=100`, {
      headers: { Cookie: `access_token=${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return { data: [], total: 0 };
    return res.json();
  } catch {
    return { data: [], total: 0 };
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

const CATEGORY_COLORS: Record<string, string> = {
  feature: 'bg-blue-100 text-blue-700',
  improvement: 'bg-purple-100 text-purple-700',
  bugfix: 'bg-red-100 text-red-700',
  bug: 'bg-red-100 text-red-700',
  security: 'bg-orange-100 text-orange-700',
};

function getCategoryColor(cat: string | null) {
  if (!cat) return 'bg-gray-100 text-gray-600';
  for (const [k, v] of Object.entries(CATEGORY_COLORS)) {
    if (cat.toLowerCase().includes(k)) return v;
  }
  return 'bg-gray-100 text-gray-600';
}

export default async function PublishedPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';
  const { data: notes, total } = await getPublishedNotes(token);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Releases Publicados</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} {total === 1 ? 'release publicado' : 'releases publicados'}</p>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="font-medium">Nenhum release publicado ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {note.customId && (
                      <span className="text-xs font-mono font-semibold bg-[#DDC444]/15 text-[#8B7A0A] px-1.5 py-0.5 rounded border border-[#DDC444]/30">
                        {note.customId}
                      </span>
                    )}
                    {note.category && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getCategoryColor(note.category)}`}>
                        {note.category}
                      </span>
                    )}
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                      Publicado
                    </span>
                  </div>
                  <p className="font-medium text-sm leading-snug">{note.rawTitle}</p>
                  {note.assigneeName && (
                    <p className="text-xs text-gray-400 mt-1">Dev: {note.assigneeName}</p>
                  )}
                </div>
                <div className="flex-shrink-0 text-right space-y-1.5">
                  <div className="text-xs whitespace-nowrap space-y-0.5">
                    <p className="text-gray-500">
                      <span className="text-gray-400">No ar:</span>{' '}
                      {note.releasedAt ? formatDate(note.releasedAt) : '—'}
                    </p>
                    <p className="text-gray-400">
                      <span className="text-gray-400">Aceito:</span>{' '}
                      {formatDate(note.publishedAt ?? note.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Link
                      href={`/admin/${note.id}`}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Editar
                    </Link>
                    <a
                      href={`/changelog#${note.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-500 hover:underline"
                    >
                      Ver ↗
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
