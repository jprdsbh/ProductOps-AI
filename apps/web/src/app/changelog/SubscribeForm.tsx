'use client';

import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

export default function SubscribeForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error' | 'exists'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

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
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Erro inesperado');
      setState('error');
    }
  }

  if (state === 'success') {
    return (
      <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-4 text-sm text-green-700">
        <span className="text-lg">✅</span>
        <span><strong>Inscrito com sucesso!</strong> Verifique seu e-mail para confirmar.</span>
      </div>
    );
  }

  if (state === 'exists') {
    return (
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-700">
        <span className="text-lg">ℹ️</span>
        <span>Este e-mail já está cadastrado!</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-6 mb-10">
      <p className="font-semibold text-gray-900 mb-1 text-sm">Receba novidades por e-mail</p>
      <p className="text-gray-500 text-xs mb-4">
        Seja notificado sempre que uma nova atualização for publicada.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#DDC444]/50 bg-gray-50"
        />
        <button
          type="submit"
          disabled={state === 'loading'}
          className="px-4 py-2 rounded-lg bg-[#DDC444] text-gray-900 font-semibold text-sm hover:bg-[#c9b23c] transition disabled:opacity-60 whitespace-nowrap"
        >
          {state === 'loading' ? 'Inscrevendo...' : 'Inscrever-se'}
        </button>
      </form>
      {state === 'error' && (
        <p className="text-xs text-red-500 mt-2">{errorMsg}</p>
      )}
    </div>
  );
}
