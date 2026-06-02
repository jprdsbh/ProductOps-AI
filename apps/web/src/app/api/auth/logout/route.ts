import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.redirect(
    new URL('/admin/login', process.env.WEB_URL ?? 'http://localhost:3000'),
  );
  response.cookies.delete('access_token');
  return response;
}
