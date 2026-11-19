import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { badRequest, setLoginCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { email, password } = await req.json();
  const user = await prisma.user.findUnique({ where: { email: (email || '').toLowerCase() } });
  if (!user || !(await bcrypt.compare(password || '', user.password))) return badRequest('Wrong email or password');

  const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, color: user.color } });
  return setLoginCookie(res, user);
}
