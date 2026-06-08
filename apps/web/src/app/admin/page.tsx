import Link from 'next/link';
import { cookies } from 'next/headers';
import { ReleaseNoteDto } from '@techdirector/shared';
import { SyncButton } from './SyncButton';

const API = process.env.API_URL ?? 'http://localhost:3002';

async function getPendingNotes(token: string): Promise<{ data: ReleaseNoteDto[]; total: number }> {
  try {
    const res = await fetch(`${API}/api/release-notes/pending?limit=500`, {
      headers: { Cookie: `access_token=${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return { data: [], total: 0 };
    return res.json();
  } catch {
    return { data: [], total: 0 };
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
}

type NoteType = 'task' | 'bug';

function classifyNote(note: ReleaseNoteDto): NoteType {
  const haystack = [note.category, note.rawTitle, note.aiGenerated]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const isBugOrSupport =
    haystack.includes('bug') ||
    haystack.includes('fix') ||
    haystack.includes('corre') ||   // correção, corrigido
    haystack.includes('erro') ||
    haystack.includes('falha') ||
    haystack.includes('suporte') ||
    haystack.includes('support') ||
    haystack.includes('atendimento') ||
    haystack.includes('helpdesk') ||
    haystack.includes('incidente');

  return isBugOrSupport ? 'bug' : 'task';
}

const CATEGORY_COLORS: Record<string, string> = {
  feature:     'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
  improvement: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800',
  melhoria:    'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800',
  bugfix:      'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  bug:         'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  suporte:     'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800',
  support:     'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800',
};

function getCategoryColor(category: string | null): string {
  if (!category) return 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
  const key = category.toLowerCase();
  for (const [k, v] of Object.entries(CATEGORY_COLORS)) {
    if (key.includes(k)) return v;
  }
  return 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
}

// Categoria real pelo emoji da nota gerada (ignora "Task"/"Frontend" do ClickUp)
function categoryBadge(note: ReleaseNoteDto): { label: string; color: string } | null {
  const t = note.finalText ?? note.aiGenerated ?? '';
  if (t.includes('🚀')) return { label: 'Novidade', color: CATEGORY_COLORS.feature };
  if (t.includes('🛠')) return { label: 'Melhoria', color: CATEGORY_COLORS.improvement };
  if (t.includes('🐛')) return { label: 'Correção', color: CATEGORY_COLORS.bugfix };
  if (t.includes('🔒')) return { label: 'Segurança', color: CATEGORY_COLORS.support };
  return null;
}

function NoteCard({ note }: { note: ReleaseNoteDto }) {
  return (
    <Link
      href={`/admin/${note.id}`}
      className="block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-gray-400 dark:hover:border-gray-600 transition group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">

          {/* Row 1: sprint + customId + category */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {(note as any).sprintName && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800">
                <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {(note as any).sprintName}
              </span>
            )}
            {(note as any).epicName && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800">
                <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h8m-8 6h16" />
                </svg>
                {(note as any).epicName}
              </span>
            )}
            {note.customId ? (
              <span className="text-xs font-mono font-bold text-[#8B7A0A] bg-[#DDC444]/15 border border-[#DDC444]/30 px-2 py-0.5 rounded">
                {note.customId}
              </span>
            ) : (
              <span className="text-xs font-mono text-gray-300 dark:text-gray-600 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded">
                {note.clickupTaskId}
              </span>
            )}
            {(() => { const c = categoryBadge(note); return c ? (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${c.color}`}>
                {c.label}
              </span>
            ) : null; })()}
            {note.status === 'DRAFT' && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-gray-50 text-gray-400 border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                rascunho
              </span>
            )}
          </div>

          {/* Row 2: title */}
          <p className="font-medium text-sm leading-snug line-clamp-1 group-hover:text-gray-600 dark:group-hover:text-gray-300">
            {note.rawTitle}
          </p>

          {/* Row 3: AI preview */}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">
            {note.aiGenerated}
          </p>
        </div>

        {/* Right: time + assignee */}
        <div className="flex-shrink-0 text-right space-y-1">
          <p className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
            {timeAgo(note.createdAt)}
          </p>
          {note.assigneeName && (
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[120px]">
              {note.assigneeName.split(',')[0].trim()}
              {note.assigneeName.includes(',') ? ' +' : ''}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

function NoteGroup({ notes, emptyMsg }: { notes: ReleaseNoteDto[]; emptyMsg: string }) {
  if (notes.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">{emptyMsg}</p>
    );
  }
  return (
    <div className="space-y-3">
      {notes.map((note) => <NoteCard key={note.id} note={note} />)}
    </div>
  );
}

type Tab = 'all' | 'tasks' | 'bugs';

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';
  const { data: notes, total } = await getPendingNotes(token);

  const tab: Tab = (searchParams.tab as Tab) ?? 'all';

  const tasks = notes.filter((n) => classifyNote(n) === 'task');
  const bugs  = notes.filter((n) => classifyNote(n) === 'bug');

  const visibleNotes =
    tab === 'tasks' ? tasks :
    tab === 'bugs'  ? bugs  :
    notes;

  const tabs: { id: Tab; label: string; count: number; icon: string }[] = [
    { id: 'all',   label: 'Todos',           count: total,        icon: '📋' },
    { id: 'tasks', label: 'Tasks',            count: tasks.length, icon: '🚀' },
    { id: 'bugs',  label: 'Bugs & Suporte',   count: bugs.length,  icon: '🐛' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Aguardando Aprovação</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {total} {total === 1 ? 'nota pendente' : 'notas pendentes'}
          </p>
        </div>
        <SyncButton />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-800 pb-px">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={t.id === 'all' ? '/admin' : `/admin?tab=${t.id}`}
            className={`
              flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition -mb-px
              ${tab === t.id
                ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }
            `}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
              tab === t.id
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}>
              {t.count}
            </span>
          </Link>
        ))}
      </div>

      {notes.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg font-medium">Tudo em dia!</p>
          <p className="text-sm mt-1">Nenhuma nota aguardando aprovação.</p>
        </div>
      ) : tab === 'all' ? (
        /* Modo "Todos": exibe as duas seções separadas */
        <div className="space-y-8">
          {tasks.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🚀</span>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tasks</h2>
                <span className="text-xs text-gray-400 dark:text-gray-500">({tasks.length})</span>
              </div>
              <NoteGroup notes={tasks} emptyMsg="Nenhuma task pendente." />
            </section>
          )}

          {bugs.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🐛</span>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Bugs & Suporte</h2>
                <span className="text-xs text-gray-400 dark:text-gray-500">({bugs.length})</span>
              </div>
              <NoteGroup notes={bugs} emptyMsg="Nenhum bug/suporte pendente." />
            </section>
          )}
        </div>
      ) : (
        /* Modo filtrado */
        <NoteGroup
          notes={visibleNotes}
          emptyMsg={tab === 'tasks' ? 'Nenhuma task pendente.' : 'Nenhum bug/suporte pendente.'}
        />
      )}
    </div>
  );
}
