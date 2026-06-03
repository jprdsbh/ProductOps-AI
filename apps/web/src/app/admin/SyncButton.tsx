'use client';

import { useState } from 'react';
import { syncClickUp, regenerateDrafts, regenerateAll, getAiStats } from './actions';

type SyncState = 'idle' | 'loading' | 'done' | 'error';

interface AiStats {
  totals: { apiCalls: number; cacheHits: number; tokensSaved: number; cacheEntries: number; hitRate: number };
  daily: { date: string; apiCalls: number; cacheHits: number; tokensSaved: number }[];
}

export function SyncButton() {
  const [syncState, setSyncState]   = useState<SyncState>('idle');
  const [regenState, setRegenState] = useState<SyncState>('idle');
  const [allState, setAllState]     = useState<SyncState>('idle');
  const [syncResult, setSyncResult] = useState<{ created: number; skipped: number; errors: number } | null>(null);
  const [regenResult, setRegenResult] = useState<{ processed: number; fromCache: number; fromApi: number; errors: number } | null>(null);
  const [allResult, setAllResult]   = useState<{ processed: number; fromApi: number; errors: number; cacheCleared: number } | null>(null);
  const [stats, setStats]           = useState<AiStats | null>(null);
  const [showStats, setShowStats]   = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [error, setError]           = useState('');

  async function handleSync() {
    setSyncState('loading');
    setSyncResult(null);
    setError('');
    try {
      setSyncResult(await syncClickUp());
      setSyncState('done');
    } catch (e: any) {
      setError(e.message);
      setSyncState('error');
    }
  }

  async function handleRegen() {
    setRegenState('loading');
    setRegenResult(null);
    setError('');
    try {
      setRegenResult(await regenerateDrafts());
      setRegenState('done');
    } catch (e: any) {
      setError(e.message);
      setRegenState('error');
    }
  }

  async function handleRegenAll() {
    const ok = window.confirm(
      '⚠️ Isto vai APAGAR o cache de IA e REGERAR todas as notas pendentes via API (custo de IA). Use só se mudou o prompt/regras. Continuar?'
    );
    if (!ok) return;
    setAllState('loading');
    setAllResult(null);
    setError('');
    try {
      setAllResult(await regenerateAll());
      setAllState('done');
    } catch (e: any) {
      setError(e.message);
      setAllState('error');
    }
  }

  async function handleStats() {
    if (showStats) { setShowStats(false); return; }
    setLoadingStats(true);
    try {
      setStats(await getAiStats());
      setShowStats(true);
    } finally {
      setLoadingStats(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2 flex-wrap justify-end">

        {/* Buscar do ClickUp */}
        <button
          onClick={handleSync}
          disabled={syncState === 'loading'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-500 transition disabled:opacity-40"
        >
          <svg className={`w-4 h-4 ${syncState === 'loading' ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {syncState === 'loading' ? 'Buscando...' : 'Buscar do ClickUp'}
        </button>

        {/* Gerar rascunhos */}
        <button
          onClick={handleRegen}
          disabled={regenState === 'loading'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 hover:border-indigo-400 transition disabled:opacity-40"
        >
          <svg className={`w-4 h-4 ${regenState === 'loading' ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          {regenState === 'loading' ? 'Gerando...' : 'Gerar rascunhos'}
        </button>

        {/* Regerar tudo (limpa cache) */}
        <button
          onClick={handleRegenAll}
          disabled={allState === 'loading'}
          title="Apaga o cache de IA e regenera TODAS as notas pendentes (custo de IA)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:border-red-400 transition disabled:opacity-40"
        >
          <svg className={`w-4 h-4 ${allState === 'loading' ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          {allState === 'loading' ? 'Regerando tudo...' : 'Regerar tudo'}
        </button>

        {/* Stats de IA */}
        <button
          onClick={handleStats}
          disabled={loadingStats}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-400 transition disabled:opacity-40"
          title="Estatísticas de uso da IA"
        >
          {loadingStats ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
          )}
          IA
        </button>
      </div>

      {/* Resultados inline */}
      <div className="flex flex-col items-end gap-1">
        {syncState === 'done' && syncResult && (
          <span className="text-xs text-gray-500">
            ✅ {syncResult.created} {syncResult.created === 1 ? 'nova' : 'novas'}
            {syncResult.skipped > 0 && ` · ${syncResult.skipped} já existiam`}
            {syncResult.errors > 0 && ` · ⚠️ ${syncResult.errors} erros`}
          </span>
        )}
        {regenState === 'done' && regenResult && (
          <span className="text-xs text-gray-500">
            ✅ {regenResult.processed} processadas
            {regenResult.fromCache > 0 && ` · 💾 ${regenResult.fromCache} do cache`}
            {regenResult.fromApi > 0 && ` · 🤖 ${regenResult.fromApi} via API`}
            {regenResult.errors > 0 && ` · ⚠️ ${regenResult.errors} erros`}
          </span>
        )}
        {allState === 'done' && allResult && (
          <span className="text-xs text-gray-500">
            🔄 {allResult.processed} regeradas · 🧹 {allResult.cacheCleared} do cache limpo · 🤖 {allResult.fromApi} via API
            {allResult.errors > 0 && ` · ⚠️ ${allResult.errors} erros`}
          </span>
        )}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>

      {/* Painel de estatísticas */}
      {showStats && stats && (
        <div className="w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-lg text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm">Uso da IA</p>
            <button onClick={() => setShowStats(false)} className="text-gray-400 hover:text-gray-600">×</button>
          </div>

          {/* Totais */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5">
              <p className="text-gray-400 mb-0.5">Cache hits</p>
              <p className="font-semibold text-green-600 dark:text-green-400 text-base">{stats.totals.cacheHits}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5">
              <p className="text-gray-400 mb-0.5">Chamadas API</p>
              <p className="font-semibold text-base">{stats.totals.apiCalls}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5">
              <p className="text-gray-400 mb-0.5">Taxa de cache</p>
              <p className="font-semibold text-indigo-600 dark:text-indigo-400 text-base">{stats.totals.hitRate}%</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5">
              <p className="text-gray-400 mb-0.5">Entradas no cache</p>
              <p className="font-semibold text-base">{stats.totals.cacheEntries}</p>
            </div>
          </div>

          {/* Últimos dias */}
          {stats.daily.length > 0 && (
            <>
              <p className="text-gray-400 font-medium mb-1.5">Últimos dias</p>
              <div className="space-y-1">
                {stats.daily.slice(0, 7).map((d) => (
                  <div key={d.date} className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-400">{d.date.slice(5)}</span>
                    <span className="text-green-600 dark:text-green-400">💾 {d.cacheHits}</span>
                    <span>🤖 {d.apiCalls}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
