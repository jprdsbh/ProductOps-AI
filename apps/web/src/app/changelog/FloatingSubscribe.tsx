'use client';

import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

export default function FloatingSubscribe() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error' | 'exists'>('idle');
  const [collapsed, setCollapsed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState('loading');
    try {
      const res = await fetch(`${API}/api/subscribers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.status === 409) { setState('exists'); return; }
      if (!res.ok) throw new Error('Erro ao cadastrar');
      setState('success');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="hidden xl:flex fixed right-6 top-24 z-40 flex-col items-end">
      <div className="w-64 bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-[#DDC444]/10 hover:bg-[#DDC444]/20 transition"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">📬</span>
            <span className="text-xs font-semibold text-gray-800">Receber novidades</span>
          </div>
          <svg
            className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Body */}
        {!collapsed && (
          <div className="px-4 py-4">
            {state === 'success' ? (
              <div className="text-center py-1">
                <p className="text-2xl mb-1">✅</p>
                <p className="text-xs font-semibold text-green-700">Inscrito com sucesso!</p>
                <p className="text-xs text-gray-500 mt-0.5">Verifique seu e-mail.</p>
              </div>
            ) : state === 'exists' ? (
              <div className="text-center py-1">
                <p className="text-2xl mb-1">ℹ️</p>
                <p className="text-xs text-amber-700 font-medium">E-mail já cadastrado!</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                  Seja notificado quando uma nova atualização for publicada.
                </p>
                <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#DDC444]/50 bg-gray-50"
                  />
                  <button
                    type="submit"
                    disabled={state === 'loading'}
                    className="w-full px-3 py-2 rounded-lg bg-[#DDC444] text-gray-900 font-semibold text-xs hover:bg-[#c9b23c] transition disabled:opacity-60"
                  >
                    {state === 'loading' ? 'Inscrevendo...' : 'Inscrever-se'}
                  </button>
                </form>
                {state === 'error' && (
                  <p className="text-xs text-red-500 mt-2">Erro ao cadastrar. Tente novamente.</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
