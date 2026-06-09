/**
 * Proxy server-side TBot.
 *
 * Por quê:
 *  - O admin pode estar rodando em prod (changelog.tpay.com.br/admin) enquanto
 *    o TBot fica na máquina local (exposto via Cloudflare Tunnel em https://tbot.tpay.com.br).
 *  - Não dá pra chamar o TBot direto do browser do usuário em prod por causa de
 *    Mixed Content (HTTPS → HTTP localhost) e CORS, e mesmo via tunnel, expor o
 *    TBOT_TOKEN no client é inseguro.
 *  - Solução: o admin (Next) recebe a chamada no /api/tbot/* (mesma origem, sem CORS),
 *    valida a sessão pelo cookie de admin, e REPASSA pro TBot adicionando o token
 *    do lado servidor. O token nunca sai do server.
 *
 * Variáveis de ambiente:
 *  - TBOT_URL        — URL pública do TBot (ex.: https://tbot.tpay.com.br ou http://localhost:8000)
 *  - TBOT_TOKEN      — token compartilhado com o TBot (X-TBot-Token)
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const TBOT_URL = process.env.TBOT_URL ?? 'http://localhost:8000';
const TBOT_TOKEN = process.env.TBOT_TOKEN ?? '';

async function requireAdmin(): Promise<boolean> {
  const c = await cookies();
  return !!c.get('access_token')?.value;
}

async function proxy(req: NextRequest, method: string, pathSegments: string[]) {
  // Só usuários logados no admin podem acessar o proxy.
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Reconstrói path + query
  const path = pathSegments.join('/');
  const url = new URL(req.url);
  const target = `${TBOT_URL.replace(/\/$/, '')}/${path}${url.search}`;

  // Repassa body apenas se faz sentido
  const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await req.text() : undefined;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (body) headers['Content-Type'] = req.headers.get('content-type') ?? 'application/json';
  if (TBOT_TOKEN) headers['X-TBot-Token'] = TBOT_TOKEN;

  try {
    const res = await fetch(target, { method, headers, body, cache: 'no-store' });
    const respHeaders = new Headers();
    const contentType = res.headers.get('content-type');
    if (contentType) respHeaders.set('Content-Type', contentType);
    const text = await res.text();
    return new NextResponse(text, { status: res.status, headers: respHeaders });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'TBot inacessível', detail: err?.message ?? String(err), tbotUrl: TBOT_URL },
      { status: 502 },
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, 'GET', path);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, 'POST', path);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, 'DELETE', path);
}
