import { NextResponse } from 'next/server';
import { getUser, unauthorized, signToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// The WebSocket server runs separately, so the browser asks for a short-lived
// token here and sends it when connecting.
export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  return NextResponse.json({ token: signToken(user, '12h') });
}
