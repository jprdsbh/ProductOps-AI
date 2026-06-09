'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ReleaseNoteDto } from '@techdirector/shared';
import { api } from '@/lib/api';

// Caminho relativo — passa pelo proxy server-side (/api/tbot/*) que injeta o
// X-TBot-Token e valida a sessão. Resolve TBot local ↔ admin em prod.
const TBOT_URL = '/api/tbot';

// Renderiza o markdown leve da nota (negrito, bullets, ---, título) de forma segura.
function renderNote(md: string) {
  const lines = (md || '').split('\n');
  let firstContentSeen = false;
  return lines.map((line, i) => {
    const t = line.trim();
    if (t === '---') return <hr key={i} className="my-3 border-gray-200 dark:border-gray-700" />;
    if (!t) return <div key={i} className="h-2" />;

    const renderInline = (s: string) =>
      s.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={j} className="font-semibold text-gray-900 dark:text-gray-100">{p.slice(2, -2)}</strong>
          : <span key={j}>{p}</span>,
      );

    if (t.startsWith('- ') || t.startsWith('• ')) {
      return (
        <div key={i} className="flex gap-2 items-start">
          <span className="text-[#DDC444] mt-0.5">▸</span>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{renderInline(t.replace(/^[-•]\s+/, ''))}</p>
        </div>
      );
    }

    if (!firstContentSeen) {
      firstContentSeen = true;
      return <p key={i} className="text-lg font-bold text-gray-900 dark:text-white leading-snug">{renderInline(line)}</p>;
    }
    return <p key={i} className="text-gray-600 dark:text-gray-300 leading-relaxed">{renderInline(line)}</p>;
  });
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING_APPROVAL: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-700' },
  PUBLISHED: { label: 'Publicado', cls: 'bg-green-100 text-green-700' },
  DRAFT: { label: 'Rascunho', cls: 'bg-gray-100 text-gray-600' },
  ARCHIVED: { label: 'Arquivado', cls: 'bg-gray-100 text-gray-500' },
};

export default function ReviewClient({ note }: { note: ReleaseNoteDto }) {
  const router = useRouter();
  const [text, setText] = useState(note.aiGenerated);
  const [imageUrl, setImageUrl] = useState(note.imageUrl ?? '');
  const [customId, setCustomId] = useState(note.customId ?? '');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const isEditable = note.status === 'PENDING_APPROVAL' || note.status === 'DRAFT';
  const status = STATUS_META[note.status] ?? STATUS_META.DRAFT;

  async function handleAction(action: () => Promise<void>, key: string) {
    setLoading(key); setError('');
    try { await action(); router.push('/admin'); router.refresh(); }
    catch (err: any) { setError(err.message ?? 'Erro inesperado'); }
    finally { setLoading(null); }
  }

  async function handleRegenerate() {
    setLoading('regen'); setError('');
    try { const u = await api.regenerate(note.id) as ReleaseNoteDto; setText(u.aiGenerated); }
    catch (err: any) { setError(err.message ?? 'Erro ao regenerar'); }
    finally { setLoading(null); }
  }

  async function handleCaptureViaTBot() {
    setLoading('tbot'); setError('');
    try {
      const res = await fetch(`${TBOT_URL}/screenshot`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: note.rawDescription, suggested_capture: note.suggestedCapture ?? '' }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail ?? 'Erro ao capturar'); }
      const data = await res.json() as { imageUrl: string };
      setImageUrl(data.imageUrl); await api.updateImage(note.id, data.imageUrl);
    } catch (err: any) { setError(err.message ?? 'Erro ao capturar via TBot'); }
    finally { setLoading(null); }
  }

  async function handlePasteImage(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (!item.type.startsWith('image/')) continue;
      e.preventDefault();
      const blob = item.getAsFile();
      if (!blob) return;
      setLoading('paste');
      setError('');
      try {
        const { imageUrl: url } = await api.uploadImage(blob);
        setImageUrl(url);
        await api.updateImage(note.id, url);
      } catch (err: any) {
        setError(err.message ?? 'Erro ao colar imagem');
      } finally {
        setLoading(null);
      }
      return;
    }
  }

  async function handleImageUrlBlur() {
    if (imageUrl !== (note.imageUrl ?? '')) { try { await api.updateImage(note.id, imageUrl); } catch {} }
  }
  async function handleCustomIdBlur() {
    if (customId !== (note.customId ?? '')) { try { await api.updateCustomId(note.id, customId); } catch {} }
  }

  return (
    <div className="space-y-4">
      {/* ── Barra de ações (fixa) ── */}
      <div className="sticky top-[3.75rem] z-10 -mx-4 px-4 py-3 bg-gray-50/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white transition flex items-center gap-1">← Voltar</Link>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${status.cls}`}>{status.label}</span>
            <p className="text-sm font-medium truncate hidden sm:block">{note.rawTitle}</p>
          </div>
          {isEditable && (
            <div className="flex items-center gap-2">
              <button onClick={handleRegenerate} disabled={!!loading}
                className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-400 transition disabled:opacity-50">
                {loading === 'regen' ? 'Regenerando...' : '↺ Regenerar'}
              </button>
              <button onClick={() => handleAction(() => api.reject(note.id) as Promise<void>, 'reject')} disabled={!!loading}
                className="text-sm px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50">
                {loading === 'reject' ? 'Rejeitando...' : 'Rejeitar'}
              </button>
              <button onClick={() => handleAction(() => api.approve(note.id, text, imageUrl || undefined) as Promise<void>, 'approve')} disabled={!!loading || !text.trim()}
                className="text-sm px-4 py-1.5 rounded-lg bg-[#DDC444] hover:bg-[#c9b23c] text-gray-900 font-semibold transition disabled:opacity-50">
                {loading === 'approve' ? 'Publicando...' : '✓ Aprovar e Publicar'}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {/* ── Workspace: descrição técnica | editor | pré-visualização ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Descrição técnica do ClickUp (pra comparar com o gerado) */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-sm flex items-center gap-1.5"><span>📌</span> Escopo técnico (ClickUp)</h2>
            {note.clickupTaskUrl && (
              <a href={note.clickupTaskUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">ver ↗</a>
            )}
          </div>
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{note.rawTitle}</p>
          <div className="flex-1 min-h-[60vh] overflow-auto rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 p-3 text-xs text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
            {note.rawDescription || '— sem descrição técnica —'}
          </div>
        </div>

        {/* Editor */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-sm flex items-center gap-1.5"><span>✏️</span> Editar nota</h2>
            <span className="text-xs text-gray-400">{text.length} caracteres</span>
          </div>
          {isEditable ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full flex-1 min-h-[60vh] px-3.5 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-[#DDC444] focus:border-[#DDC444] leading-relaxed"
              placeholder="Texto da release note..."
            />
          ) : (
            <div className="flex-1 min-h-[60vh] bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm font-mono whitespace-pre-wrap overflow-auto">{note.finalText ?? note.aiGenerated}</div>
          )}
        </div>

        {/* Pré-visualização */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col">
          <h2 className="font-semibold text-sm mb-2 flex items-center gap-1.5"><span>👁️</span> Pré-visualização <span className="text-xs text-gray-400 font-normal">(como vai aparecer)</span></h2>
          <div className="flex-1 min-h-[60vh] overflow-auto rounded-lg border border-gray-100 dark:border-gray-800 bg-[#FAFAFA] dark:bg-gray-950 p-5 space-y-1">
            {renderNote(text)}
          </div>
        </div>
      </div>

      {/* ── Contexto: tarefa original | imagem ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tarefa original */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-1.5"><span>🏷️</span> Identificação</h3>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">ID amigável</p>
                <input type="text" value={customId} onChange={(e) => setCustomId(e.target.value.toUpperCase())} onBlur={handleCustomIdBlur}
                  placeholder="ex: DEV-1001"
                  className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-mono font-semibold text-[#8B7A0A] focus:outline-none focus:ring-2 focus:ring-[#DDC444]/50" />
              </div>
              {note.version && (
                <div><p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Versão</p><p className="font-mono">v{note.version}</p></div>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">ID ClickUp</p>
              <p className="font-mono text-xs text-gray-400">{note.clickupTaskId}</p>
            </div>
          </div>
        </div>

        {/* Imagem */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5"
          onPaste={isEditable ? handlePasteImage : undefined} tabIndex={isEditable ? 0 : undefined}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-1.5"><span>🖼️</span> Imagem</h3>
            {isEditable && (
              <button onClick={handleCaptureViaTBot} disabled={!!loading}
                title="Captura automática da tela da funcionalidade via TBot"
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md transition disabled:opacity-50">
                {loading === 'tbot' ? '⏳ Capturando...' : '📸 Capturar via TBot'}
              </button>
            )}
          </div>
          {note.suggestedCapture && (
            <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300">
              <span className="font-semibold">💡 Sugestão:</span> {note.suggestedCapture}
            </div>
          )}
          {isEditable && (
            <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} onBlur={handleImageUrlBlur}
              placeholder="Cole a URL da imagem ou use o botão TBot"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#DDC444]/50" />
          )}
          {imageUrl ? (
            <div className="mt-3 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <img src={imageUrl} alt="Screenshot" className="w-full object-contain max-h-72" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          ) : (
            <div className="mt-3 h-32 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs text-gray-400">
              {loading === 'paste' ? 'Enviando imagem...' : 'Sem imagem — cole com Ctrl+V ou use o TBot'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
