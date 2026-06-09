/**
 * Proxy de IMAGEM do TBot (screenshots).
 * Separado do proxy JSON para não corromper bytes.
 * URL: /api/tbot-img/<path-do-tbot>  (ex.: /api/tbot-img/screenshots/foo.png)
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const TBOT_URL = process.env.TBOT_URL ?? 'http://localhost:8000';
const TBOT_TOKEN = process.env.TBOT_TOKEN ?? '';

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const c = await cookies();
  if (!c.get('access_token')?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { path } = await ctx.params;
  const url = new URL(req.url);
  const target = `${TBOT_URL.replace(/\/$/, '')}/${path.join('/')}${url.search}`;

  const headers: Record<string, string> = {};
  if (TBOT_TOKEN) headers['X-TBot-Token'] = TBOT_TOKEN;

  try {
    const upstream = await fetch(target, { headers, cache: 'no-store' });
    const ct = upstream.headers.get('content-type') ?? 'application/octet-stream';
    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      status: upstream.status,
      headers: { 'Content-Type': ct, 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'TBot img inacessível', detail: err?.message }, { status: 502 });
  }
}
