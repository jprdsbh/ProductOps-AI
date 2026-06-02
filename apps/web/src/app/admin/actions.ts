'use server';

import { cookies } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:3002';

async function authHeaders() {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';
  return { Cookie: `access_token=${token}`, 'Content-Type': 'application/json' };
}

export async function syncClickUp(): Promise<{ created: number; skipped: number; errors: number }> {
  const res = await fetch(`${API}/api/clickup-sync/trigger`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Sync failed (${res.status})`);
  return res.json();
}

export async function regenerateDrafts(): Promise<{
  processed: number;
  fromCache: number;
  fromApi: number;
  errors: number;
}> {
  const res = await fetch(`${API}/api/release-notes/regenerate-drafts`, {
    method: 'POST',
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Regenerate failed (${res.status})`);
  return res.json();
}

export async function getAiStats(): Promise<{
  totals: {
    apiCalls: number;
    cacheHits: number;
    tokensSaved: number;
    cacheEntries: number;
    hitRate: number;
  };
  daily: { date: string; apiCalls: number; cacheHits: number; tokensSaved: number }[];
}> {
  const res = await fetch(`${API}/api/release-notes/ai-stats`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) return { totals: { apiCalls: 0, cacheHits: 0, tokensSaved: 0, cacheEntries: 0, hitRate: 0 }, daily: [] };
  return res.json();
}
