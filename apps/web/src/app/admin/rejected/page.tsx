import { cookies } from 'next/headers';
import { ReleaseNoteDto } from '@techdirector/shared';
import RestoreButton from './RestoreButton';

const API = process.env.API_URL ?? 'http://localhost:3002';

async function getArchived(token: string): Promise<{ data: ReleaseNoteDto[]; total: number }> {
  try {
    const res = await fetch(`${API}/api/release-notes/archived?limit=200`, {
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
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function RejectedPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';
  const { data: notes, total } = await getArchived(token);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold flex items-center gap-2"><span>🚫</span> Reprovadas (blacklist)</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {total} {total === 1 ? 'tarefa reprovada' : 'tarefas reprovadas'} — não reaparecem em Pendentes nem no sync. Restaure se quiser reavaliar.
        </p>
      </div>

      {notes.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="font-medium">Nenhuma tarefa reprovada.</p>
          <p className="text-xs mt-1">As notas que você rejeitar aparecem aqui.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {note.customId && (
                    <span className="text-xs font-mono font-semibold bg-[#DDC444]/15 text-[#8B7A0A] px-1.5 py-0.5 rounded border border-[#DDC444]/30">
                      {note.customId}
                    </span>
                  )}
                  <span className="text-[11px] font-mono text-gray-400">{note.clickupTaskId}</span>
                  {note.sprintName && <span className="text-[11px] text-gray-400">· {note.sprintName}</span>}
                </div>
                <p className="font-medium text-sm leading-snug">{note.rawTitle}</p>
                {note.assigneeName && <p className="text-xs text-gray-400 mt-0.5">Dev: {note.assigneeName}</p>}
              </div>
              <div className="flex-shrink-0 flex flex-col items-end gap-2">
                <span className="text-xs text-gray-400 whitespace-nowrap">reprovada {formatDate(note.updatedAt)}</span>
                <div className="flex items-center gap-2">
                  {note.clickupTaskUrl && (
                    <a href={note.clickupTaskUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:underline">ClickUp ↗</a>
                  )}
                  <RestoreButton id={note.id} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
