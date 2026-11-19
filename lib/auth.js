import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from './prisma';

const SECRET = process.env.JWT_SECRET;

export const signToken = (user, expiresIn = '7d') => jwt.sign({ id: user.id }, SECRET, { expiresIn });

// Reads the login cookie and returns the user (or null)
export async function getUser() {
  const token = cookies().get('token')?.value;
  if (!token) return null;
  try {
    const { id } = jwt.verify(token, SECRET);
    return await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, color: true } });
  } catch (err) {
    return null;
  }
}

export const unauthorized = () => NextResponse.json({ message: 'Please login first' }, { status: 401 });
export const forbidden = (msg = 'You do not have permission for this') => NextResponse.json({ message: msg }, { status: 403 });
export const notFound = (msg = 'Not found') => NextResponse.json({ message: msg }, { status: 404 });
export const badRequest = (msg) => NextResponse.json({ message: msg }, { status: 400 });

export function setLoginCookie(res, user) {
  res.cookies.set('token', signToken(user), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 3600 });
  return res;
}
