import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ReleaseNoteDto } from '@techdirector/shared';
import ReviewClient from './ReviewClient';

const API = process.env.API_URL ?? 'http://localhost:3001';

async function getNote(id: string, token: string): Promise<ReleaseNoteDto | null> {
  try {
    const res = await fetch(`${API}/api/release-notes/${id}`, {
      headers: { Cookie: `access_token=${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function ReviewPage({ params }: { params: { id: string } }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';
  const note = await getNote(params.id, token);

  if (!note) notFound();

  return <ReviewClient note={note} />;
}
