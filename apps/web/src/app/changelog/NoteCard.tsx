'use client';

import { useState } from 'react';
import { ReleaseNoteDto } from '@techdirector/shared';

const GATEWAY_BASE = 'https://gateway.tamborete.com.br';

const ROUTE_LABELS: Record<string, string> = {
  '/':               'Dashboard',
  '/transactions':   'Transações',
  '/payment-link':   'Links de Pagamento',
  '/payment-link/create': 'Criar Link',
  '/products':       'Produtos',
  '/templates':      'Templates de Checkout',
  '/balance':        'Extrato',
  '/receipts':       'Recibos',
  '/coupons':        'Cupons',
  '/sales-funnel':   'Funil de Vendas',
  '/integrations':   'Integrações',
  '/pixels':         'Pixels',
  '/order-bump':     'Order Bump',
  '/sales':          'Vendas',
  '/pix-agent':      'Agente PIX',
  '/my-company':     'Minha Empresa',
  '/perfil':         'Perfil',
};

function getRouteLabel(path: string): string {
  return ROUTE_LABELS[path] ?? path;
}

function stripLeadingEmoji(str: string): string {
  return str.replace(/^[\p{Emoji}\s]+/u, '').trim();
}

function cleanDashes(str: string): string {
  return str.replace(/\s—\s/g, ', ');
}

type Inline = { type: 'bold'; text: string } | { type: 'text'; text: string };

function parseInline(str: string): Inline[] {
  const parts = str.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p) =>
    p.startsWith('**') && p.endsWith('**')
      ? { type: 'bold', text: p.slice(2, -2) }
      : { type: 'text', text: p }
  );
}

function InlineContent({ str }: { str: string }) {
  const cleaned = cleanDashes(str);
  return (
    <>
      {cleaned.split(/(!\[[^\]]*\]\([^)]+\))/g).map((segment, i) => {
        const imgMatch = segment.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imgMatch) return <img key={i} src={imgMatch[2]} alt={imgMatch[1]} className="rounded-lg max-w-full my-3 border border-gray-100" />;
        return parseInline(segment).map((part, j) =>
          part.type === 'bold'
            ? <strong key={`${i}-${j}`} className="font-semibold text-gray-900">{part.text}</strong>
            : <span key={`${i}-${j}`}>{part.text}</span>
        );
      })}
    </>
  );
}

function ReleaseNoteBody({ text }: { text: string }) {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let inSignature = false;
  const signatureLines: string[] = [];
  let isFirst = true;
  let key = 0;

  const flushList = () => {
    if (listItems.length) {
      nodes.push(<ul key={key++} className="space-y-2 my-3">{listItems}</ul>);
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === '---') { flushList(); inSignature = true; continue; }
    if (inSignature) { if (line) signatureLines.push(line); continue; }

    if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
      flushList();
      nodes.push(
        <p key={key++} className="font-semibold text-gray-700 mt-4 mb-1 text-xs uppercase tracking-widest">
          {line.slice(2, -2)}
        </p>
      );
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('• ')) {
      listItems.push(
        <li key={key++} className="flex gap-2 text-gray-700 text-[15px] leading-relaxed">
          <span className="text-[#DDC444] mt-1 flex-shrink-0 text-xs">▸</span>
          <span><InlineContent str={line.slice(2)} /></span>
        </li>
      );
      continue;
    }

    if (line === '') { flushList(); continue; }
    flushList();

    if (isFirst) {
      isFirst = false;
      nodes.push(
        <h2 key={key++} className="text-xl font-bold text-gray-900 leading-tight mb-3">
          {stripLeadingEmoji(line)}
        </h2>
      );
    } else {
      nodes.push(
        <p key={key++} className="text-gray-600 text-[15px] leading-relaxed">
          <InlineContent str={line} />
        </p>
      );
    }
  }

  flushList();

  return (
    <>
      {nodes}
      {signatureLines.length > 0 && (
        <div className="mt-5 pt-4 border-t border-gray-100">
          {signatureLines.map((l, i) => (
            <p key={i} className="text-xs text-gray-400 leading-relaxed">{l}</p>
          ))}
        </div>
      )}
    </>
  );
}

interface Props {
  note: ReleaseNoteDto;
  meta: { label: string; color: string } | null;
  displayText: string;
  formattedDate: string;
  defaultOpen?: boolean;
}

export default function NoteCard({ note, meta, displayText, formattedDate, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  // Extract title: first non-empty line stripped of emoji
  const titleLine = displayText.split('\n').find((l) => l.trim()) ?? note.rawTitle;
  const title = stripLeadingEmoji(titleLine.trim());

  return (
    <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Always-visible header — click to toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-6 pt-5 pb-4 flex items-start justify-between gap-4 group"
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">
          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <time dateTime={note.releasedAt ?? note.publishedAt ?? note.createdAt} className="text-xs text-gray-400 font-medium">
              {formattedDate}
            </time>
            {note.customId && (
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-[#DDC444]/15 text-[#8B7A0A] border border-[#DDC444]/30">
                {note.customId}
              </span>
            )}
            {meta && (
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${meta.color}`}>
                {meta.label}
              </span>
            )}
            {note.version && (
              <span className="text-xs font-mono text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-md">
                v{note.version}
              </span>
            )}
          </div>

          {/* Title always visible */}
          <p className="font-semibold text-gray-900 text-base leading-snug truncate pr-2">{title}</p>
        </div>

        {/* Chevron */}
        <span
          className={`flex-shrink-0 mt-1 text-gray-400 group-hover:text-gray-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {/* Collapsible body */}
      {open && (
        <div className="px-6 pb-5 border-t border-gray-50 pt-4">
          <ReleaseNoteBody text={displayText} />

          {note.suggestedRoute && (
            <div className="mt-4 pt-3 border-t border-gray-50 flex items-center gap-2">
              <span className="text-xs text-gray-400">Ver no sistema:</span>
              <a
                href={`${GATEWAY_BASE}${note.suggestedRoute}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-[#8B7A0A] bg-[#DDC444]/10 border border-[#DDC444]/30 px-2.5 py-1 rounded-full hover:bg-[#DDC444]/20 transition"
              >
                {getRouteLabel(note.suggestedRoute)}
                <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}

          {note.assigneeName && (
            <div className={`${note.suggestedRoute ? 'mt-3' : 'mt-4 pt-3 border-t border-gray-50'} flex flex-wrap items-center gap-2`}>
              <span className="text-xs text-gray-400">Desenvolvido por</span>
              {note.assigneeName.split(',').map((name) => name.trim()).filter(Boolean).map((name) => (
                <span key={name} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
                  <span className="w-5 h-5 rounded-full bg-[#DDC444]/20 flex items-center justify-center text-[10px] font-bold text-[#8B7A0A]">
                    {name.charAt(0).toUpperCase()}
                  </span>
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Image — only shown when expanded */}
      {open && note.imageUrl && (
        <div className="border-t border-gray-50">
          <img
            src={note.imageUrl}
            alt={`Screenshot: ${note.rawTitle}`}
            className="w-full object-cover max-h-80"
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}
