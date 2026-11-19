import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { badRequest, setLoginCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// each user gets a colour, used for their cursor and avatar
const COLORS = ['#e5484d', '#3e63dd', '#30a46c', '#f76b15', '#8e4ec6', '#12a594', '#d6409f', '#ab6400'];

export async function POST(req) {
  const { name, email, password } = await req.json();
  if (!name || !email || !password) return badRequest('Name, email and password are required');
  if (password.length < 6) return badRequest('Password must be at least 6 characters');

  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) return badRequest('Email is already registered');

  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      password: await bcrypt.hash(password, 10),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    },
  });
  const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, color: user.color } }, { status: 201 });
  return setLoginCookie(res, user);
}
