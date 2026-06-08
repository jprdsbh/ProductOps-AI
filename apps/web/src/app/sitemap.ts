import { MetadataRoute } from 'next';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
const BASE = process.env.NEXT_PUBLIC_WEB_URL ?? 'https://changelog.tpay.com.br';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: `${BASE}/changelog`, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
  ];

  try {
    const res = await fetch(`${API}/api/release-notes/public?limit=100`, { cache: 'no-store' });
    if (res.ok) {
      const { data } = await res.json();
      for (const note of data) {
        entries.push({
          url: `${BASE}/changelog#${note.id}`,
          lastModified: new Date(note.publishedAt ?? note.createdAt),
          changeFrequency: 'monthly',
          priority: 0.7,
        });
      }
    }
  } catch {
    // skip dynamic entries if API is down
  }

  return entries;
}
