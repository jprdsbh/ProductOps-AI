import { Metadata } from 'next';
import { Suspense } from 'react';
import { ReleaseNoteDto } from '@techdirector/shared';
import SubscribeForm from './SubscribeForm';
import ChangelogFilters from './ChangelogFilters';
import NoteCard from './NoteCard';
import FloatingSubscribe from './FloatingSubscribe';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
const BASE = process.env.NEXT_PUBLIC_WEB_URL ?? 'https://changelog.tamboretemay.com.br';

export const metadata: Metadata = {
  title: 'Changelog — TamboretePay',
  description: 'Acompanhe as últimas atualizações, melhorias e correções da plataforma TamboretePay — a fintech de pagamentos B2B.',
  metadataBase: new URL(BASE),
  alternates: { canonical: '/changelog' },
  openGraph: {
    title: 'Changelog — TamboretePay',
    description: 'Veja as novidades da plataforma TamboretePay: novas funcionalidades, melhorias e correções.',
    url: `${BASE}/changelog`,
    siteName: 'TamboretePay',
    type: 'website',
    locale: 'pt_BR',
  },
  twitter: {
    card: 'summary',
    title: 'Changelog — TamboretePay',
    description: 'Veja as novidades da plataforma TamboretePay.',
  },
  robots: { index: true, follow: true },
};

async function getPublishedNotes(category?: string, sort?: string): Promise<{ data: ReleaseNoteDto[]; total: number }> {
  try {
    const res = await fetch(`${API}/api/release-notes/public?limit=100`, { cache: 'no-store' });
    if (!res.ok) return { data: [], total: 0 };
    const all: { data: ReleaseNoteDto[]; total: number } = await res.json();

    let notes = all.data;
    if (category) {
      notes = notes.filter((n) => n.category?.toLowerCase().includes(category.toLowerCase()));
    }
    if (sort === 'asc') notes = [...notes].reverse();

    return { data: notes, total: all.total };
  } catch {
    return { data: [], total: 0 };
  }
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  feature:     { label: 'Nova funcionalidade', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  improvement: { label: 'Melhoria', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  performance: { label: 'Performance', color: 'bg-green-50 text-green-700 border-green-200' },
  melhoria:    { label: 'Melhoria', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  bugfix:      { label: 'Correção', color: 'bg-red-50 text-red-700 border-red-200' },
  bug:         { label: 'Correção', color: 'bg-red-50 text-red-700 border-red-200' },
  security:    { label: 'Segurança', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  segurança:   { label: 'Segurança', color: 'bg-orange-50 text-orange-700 border-orange-200' },
};

function getCategoryMeta(category: string | null) {
  if (!category) return null;
  const key = category.toLowerCase();
  for (const [k, v] of Object.entries(CATEGORY_META)) {
    if (key.includes(k)) return v;
  }
  return { label: category, color: 'bg-gray-50 text-gray-600 border-gray-200' };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function TPayLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 480" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M441.523 94.7973H38.4769V133.275H441.523V94.7973Z" fill="#DDC444"/>
      <path d="M38.4769 205.09H209.257L77.8533 336.493L105.052 363.692L222.832 245.913V423.681H261.309V245.913L379.089 363.692L406.288 336.493L274.884 205.09H441.523V166.612H38.4769V205.09Z" fill="#DDC444"/>
      <path d="M480 56.3188H441.523V94.7973L480 94.7968V56.3188Z" fill="#DDC444"/>
      <path d="M38.478 56.3188H0V94.7968L38.4769 94.7973L38.478 56.3188Z" fill="#DDC444"/>
    </svg>
  );
}

function buildJsonLd(notes: ReleaseNoteDto[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'TamboretePay Changelog',
    description: 'Atualizações da plataforma TamboretePay',
    url: `${BASE}/changelog`,
    itemListElement: notes.map((note, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Article',
        headline: note.rawTitle,
        datePublished: note.releasedAt ?? note.publishedAt ?? note.createdAt,
        dateModified: note.updatedAt,
        publisher: { '@type': 'Organization', name: 'TamboretePay', url: 'https://tamboretemay.com.br' },
      },
    })),
  };
}

export default async function ChangelogPage({
  searchParams,
}: {
  searchParams: { category?: string; sort?: string };
}) {
  const category = searchParams.category ?? '';
  const sort = searchParams.sort ?? 'desc';
  const { data: notes, total } = await getPublishedNotes(category, sort);

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* JSON-LD structured data — escapa '<' para evitar quebra do <script> (XSS via título da task) */}
      {/* security-scan-ignore: JSON.stringify + escape de < neutraliza o XSS */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildJsonLd(notes))
            .replace(/</g, '\\u003c')
            .replace(/-->/g, '--\\u003e'),
        }}
      />

      {/* Top gold bar */}
      <div className="h-1 w-full bg-[#DDC444]" />

      {/* Floating subscribe widget — visible only on xl+ screens */}
      <FloatingSubscribe />

      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <TPayLogo className="w-7 h-7" />
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-gray-900 tracking-tight">TamboretePay</span>
            <span className="text-sm text-gray-400">Changelog</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Page intro */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Novidades do produto</h1>
          <p className="mt-2 text-gray-500 text-base">
            Acompanhe as últimas atualizações, melhorias e correções da plataforma TamboretePay.
          </p>
        </div>

        {/* Email subscription — inline, visible on smaller screens */}
        <div className="xl:hidden">
          <Suspense>
            <SubscribeForm />
          </Suspense>
        </div>

        {/* Filters */}
        <Suspense>
          <ChangelogFilters total={total} />
        </Suspense>

        {notes.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#DDC444]/10 flex items-center justify-center">
              <TPayLogo className="w-7 h-7" />
            </div>
            <p className="text-gray-500 font-medium">
              {category ? 'Nenhuma atualização nesta categoria ainda.' : 'Nenhuma atualização publicada ainda.'}
            </p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-gray-200" />

            <div className="space-y-4">
              {notes.map((note, index) => {
                const meta = getCategoryMeta(note.category);
                const displayText = note.finalText ?? note.aiGenerated;

                return (
                  <article key={note.id} id={note.id} className="relative flex gap-6">
                    {/* Timeline dot */}
                    <div className="flex-shrink-0 w-6 flex flex-col items-center pt-4">
                      <div className="w-3 h-3 rounded-full bg-[#DDC444] ring-4 ring-[#FAFAFA] z-10" />
                    </div>

                    {/* Collapsible card */}
                    <NoteCard
                      note={note}
                      meta={meta}
                      displayText={displayText}
                      formattedDate={formatDate(note.releasedAt ?? note.publishedAt ?? note.createdAt)}
                      defaultOpen={index === 0}
                    />
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} TamboretePay — Plataforma de Pagamentos B2B
          </p>
        </div>
      </main>
    </div>
  );
}
