'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

function TPayLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 480" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M441.523 94.7973H38.4769V133.275H441.523V94.7973Z" fill="currentColor" />
      <path d="M38.4769 205.09H209.257L77.8533 336.493L105.052 363.692L222.832 245.913V423.681H261.309V245.913L379.089 363.692L406.288 336.493L274.884 205.09H441.523V166.612H38.4769V205.09Z" fill="currentColor" />
      <path d="M480 56.3188H441.523V94.7973L480 94.7968V56.3188Z" fill="currentColor" />
      <path d="M38.478 56.3188H0V94.7968L38.4769 94.7973L38.478 56.3188Z" fill="currentColor" />
    </svg>
  );
}

const FEATURES = [
  { icon: '📝', title: 'Release notes com IA', desc: 'Do ClickUp ao changelog, com aprovação humana.' },
  { icon: '🤖', title: 'QA autônomo (TBot)', desc: 'Testa, valida segurança e aprende a cada execução.' },
  { icon: '🧠', title: 'Base de conhecimento', desc: 'Os agentes evoluem juntos sobre os mesmos aprendizados.' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.login(email, password);
      router.push('/admin');
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? 'Credenciais inválidas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      {/* ── Painel de marca (esquerda) ── */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f0f1a] p-12 text-white">
        {/* glow dourado + padrão de pontos */}
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-[#DDC444]/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-[#DDC444]/10 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{ backgroundImage: 'radial-gradient(#DDC444 1px, transparent 1px)', backgroundSize: '28px 28px' }}
        />

        {/* topo: logo */}
        <div className="relative flex items-center gap-3">
          <TPayLogo className="w-9 h-9 text-[#DDC444]" />
          <span className="text-lg font-bold tracking-tight">TamboretePay</span>
        </div>

        {/* meio: título */}
        <div className="relative">
          <p className="text-[#DDC444] font-semibold text-sm uppercase tracking-widest mb-3">Product Ops</p>
          <h2 className="text-4xl font-bold leading-tight">
            Releases e QA<br />num só lugar.
          </h2>
          <p className="text-gray-300 mt-4 max-w-sm leading-relaxed">
            A central que transforma tarefas do ClickUp em release notes e testa o produto sozinha.
          </p>
        </div>

        {/* base: features */}
        <div className="relative space-y-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-start gap-3">
              <span className="text-xl leading-none">{f.icon}</span>
              <div>
                <p className="font-semibold text-sm">{f.title}</p>
                <p className="text-gray-400 text-xs">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Formulário (direita) ── */}
      <div className="flex items-center justify-center px-6 py-12 bg-gray-50">
        <div className="w-full max-w-sm">
          {/* logo no mobile */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <TPayLogo className="w-8 h-8 text-[#DDC444]" />
            <span className="text-lg font-bold">TamboretePay</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Bem-vindo de volta 👋</h1>
            <p className="text-gray-500 text-sm mt-1">Entre para gerenciar os releases e o QA.</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-xl shadow-gray-200/60 border border-gray-100 p-7 space-y-5"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#DDC444] focus:border-[#DDC444] focus:bg-white transition"
                placeholder="voce@tpay.com.br"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#DDC444] focus:border-[#DDC444] focus:bg-white transition"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <span>⚠️</span> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#DDC444] hover:bg-[#c9b23c] text-gray-900 py-2.5 px-4 rounded-xl font-semibold text-sm transition disabled:opacity-60 shadow-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Entrando...
                </>
              ) : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            Acesso restrito · TamboretePay · Product Ops
          </p>
        </div>
      </div>
    </div>
  );
}
