const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? 'API error');
  }
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () => apiFetch('/auth/logout', { method: 'POST' }),

  me: () => apiFetch('/auth/me'),

  getPending: (page = 1) =>
    apiFetch(`/release-notes/pending?page=${page}&limit=20`),

  getPublished: (page = 1) =>
    apiFetch(`/release-notes/public?page=${page}&limit=20`),

  getOne: (id: string) => apiFetch(`/release-notes/${id}`),

  approve: (id: string, finalText: string, imageUrl?: string) =>
    apiFetch(`/release-notes/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ finalText, ...(imageUrl ? { imageUrl } : {}) }),
    }),

  updateImage: (id: string, imageUrl: string) =>
    apiFetch(`/release-notes/${id}/image`, {
      method: 'PATCH',
      body: JSON.stringify({ imageUrl }),
    }),

  reject: (id: string) =>
    apiFetch(`/release-notes/${id}/reject`, { method: 'PATCH' }),

  updateText: (id: string, aiGenerated: string) =>
    apiFetch(`/release-notes/${id}/text`, {
      method: 'PATCH',
      body: JSON.stringify({ aiGenerated }),
    }),

  regenerate: (id: string) =>
    apiFetch(`/release-notes/${id}/regenerate`, { method: 'POST' }),

  updateCustomId: (id: string, customId: string) =>
    apiFetch(`/release-notes/${id}/custom-id`, {
      method: 'PATCH',
      body: JSON.stringify({ customId }),
    }),
};
