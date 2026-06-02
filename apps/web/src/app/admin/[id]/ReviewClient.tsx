'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ReleaseNoteDto } from '@techdirector/shared';
import { api } from '@/lib/api';

const TBOT_URL = process.env.NEXT_PUBLIC_TBOT_URL ?? 'http://localhost:8000';

export default function ReviewClient({ note }: { note: ReleaseNoteDto }) {
  const router = useRouter();
  const [text, setText] = useState(note.aiGenerated);
  const [imageUrl, setImageUrl] = useState(note.imageUrl ?? '');
  const [customId, setCustomId] = useState(note.customId ?? '');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const isEditable = note.status === 'PENDING_APPROVAL' || note.status === 'DRAFT';

  async function handleAction(action: () => Promise<void>, key: string) {
    setLoading(key);
    setError('');
    try {
      await action();
      router.push('/admin');
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? 'Erro inesperado');
    } finally {
      setLoading(null);
    }
  }

  async function handleRegenerate() {
    setLoading('regen');
    setError('');
    try {
      const updated = await api.regenerate(note.id) as ReleaseNoteDto;
      setText(updated.aiGenerated);
    } catch (err: any) {
      setError(err.message ?? 'Erro ao regenerar');
    } finally {
      setLoading(null);
    }
  }

  async function handleCaptureViaTBot() {
    setLoading('tbot');
    setError('');
    try {
      const res = await fetch(`${TBOT_URL}/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: note.rawDescription,
          suggested_capture: note.suggestedCapture ?? '',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? 'Erro ao capturar screenshot');
      }
      const data = await res.json() as { imageUrl: string };
      setImageUrl(data.imageUrl);
      await api.updateImage(note.id, data.imageUrl);
    } catch (err: any) {
      setError(err.message ?? 'Erro ao capturar via TBot');
    } finally {
      setLoading(null);
    }
  }

  async function handleImageUrlBlur() {
    if (imageUrl !== (note.imageUrl ?? '')) {
      try {
        await api.updateImage(note.id, imageUrl);
      } catch {
        // silently ignore
      }
    }
  }

  async function handleCustomIdBlur() {
    if (customId !== (note.customId ?? '')) {
      try {
        await api.updateCustomId(note.id, customId);
      } catch {
        // silently ignore
      }
    }
  }

  return (
    <div>
      <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white transition mb-6 inline-flex items-center gap-1">
        ← Voltar
      </Link>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left: Raw task data */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm">Tarefa Original (ClickUp)</h2>
            {note.clickupTaskUrl && (
              <a
                href={note.clickupTaskUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Ver no ClickUp ↗
              </a>
            )}
          </div>

          <div className="space-y-4 text-sm">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium mb-1">ID da Tarefa</p>
                <input
                  type="text"
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value.toUpperCase())}
                  onBlur={handleCustomIdBlur}
                  placeholder="ex: DEV-1001"
                  className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-mono font-semibold text-[#8B7A0A] focus:outline-none focus:ring-2 focus:ring-[#DDC444]/50"
                />
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium mb-1">ID ClickUp</p>
                <p className="font-mono text-gray-400 dark:text-gray-500 text-xs">{note.clickupTaskId}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium mb-1">Título</p>
              <p className="font-medium">{note.rawTitle}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium mb-1">Descrição Técnica</p>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                {note.rawDescription || '—'}
              </p>
            </div>
            <div className="flex gap-4">
              {note.category && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Categoria</p>
                  <p>{note.category}</p>
                </div>
              )}
              {note.version && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Versão</p>
                  <p className="font-mono">v{note.version}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: AI-generated + editor */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 flex flex-col gap-4">

          {/* Text section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-sm">Release Note (IA)</h2>
              {isEditable && (
                <button
                  onClick={handleRegenerate}
                  disabled={loading === 'regen'}
                  className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white transition disabled:opacity-50"
                >
                  {loading === 'regen' ? 'Regenerando...' : '↺ Regenerar'}
                </button>
              )}
            </div>

            {isEditable ? (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-100 leading-relaxed"
                placeholder="Texto da release note..."
              />
            ) : (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm leading-relaxed">
                {note.finalText ?? note.aiGenerated}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1 text-right">{text.length} caracteres</p>
          </div>

          {/* Image section */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Imagem</h3>
              {isEditable && (
                <button
                  onClick={handleCaptureViaTBot}
                  disabled={!!loading}
                  title="Abre o TBot para capturar automaticamente a tela da funcionalidade na TPAY"
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-md transition disabled:opacity-50 flex items-center gap-1"
                >
                  {loading === 'tbot' ? '⏳ Capturando...' : '📸 Capturar via TBot'}
                </button>
              )}
            </div>

            {/* Suggested capture hint */}
            {note.suggestedCapture && (
              <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                <span className="font-semibold">💡 Sugestão de captura:</span>{' '}
                {note.suggestedCapture}
              </div>
            )}

            {isEditable ? (
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                onBlur={handleImageUrlBlur}
                placeholder="Cole a URL da imagem ou use o botão TBot acima"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-100"
              />
            ) : null}

            {/* Preview */}
            {imageUrl && (
              <div className="mt-3 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <img
                  src={imageUrl}
                  alt="Screenshot da funcionalidade"
                  className="w-full object-cover max-h-64"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {/* Status badge */}
          <div>
            <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium ${
              note.status === 'PENDING_APPROVAL'
                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                : note.status === 'PUBLISHED'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}>
              {note.status === 'PENDING_APPROVAL' ? 'Pendente' :
               note.status === 'PUBLISHED' ? 'Publicado' :
               note.status === 'DRAFT' ? 'Rascunho' : 'Arquivado'}
            </span>
          </div>

          {/* Actions */}
          {isEditable && (
            <div className="flex gap-3 mt-auto">
              <button
                onClick={() =>
                  handleAction(
                    () => api.approve(note.id, text, imageUrl || undefined) as Promise<void>,
                    'approve',
                  )
                }
                disabled={!!loading || !text.trim()}
                className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-gray-900 py-2 px-4 rounded-lg font-medium text-sm hover:opacity-90 transition disabled:opacity-50"
              >
                {loading === 'approve' ? 'Publicando...' : 'Aprovar e Publicar'}
              </button>
              <button
                onClick={() =>
                  handleAction(() => api.reject(note.id) as Promise<void>, 'reject')
                }
                disabled={!!loading}
                className="px-4 py-2 rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50"
              >
                {loading === 'reject' ? 'Rejeitando...' : 'Rejeitar'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
