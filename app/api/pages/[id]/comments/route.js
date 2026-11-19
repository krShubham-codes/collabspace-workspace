import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser, unauthorized, forbidden, notFound, badRequest } from '@/lib/auth';
import { getPageAccess, canComment } from '@/lib/access';

export const dynamic = 'force-dynamic';

// GET /api/pages/:id/comments
export async function GET(req, { params }) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { page, role } = await getPageAccess(user.id, params.id);
  if (!page) return notFound('Page not found');
  if (!role) return forbidden();

  const comments = await prisma.comment.findMany({
    where: { pageId: params.id },
    include: { user: { select: { name: true, color: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(comments);
}

// POST /api/pages/:id/comments  { text }   (COMMENT, EDIT and OWNER roles)
export async function POST(req, { params }) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { page, role } = await getPageAccess(user.id, params.id);
  if (!page) return notFound('Page not found');
  if (!canComment(role)) return forbidden('View-only users cannot comment');

  const { text } = await req.json();
  if (!text || !text.trim()) return badRequest('Comment cannot be empty');

  const comment = await prisma.comment.create({
    data: { pageId: params.id, userId: user.id, text: text.trim() },
    include: { user: { select: { name: true, color: true } } },
  });
  return NextResponse.json(comment, { status: 201 });
}
