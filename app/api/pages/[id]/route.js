import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser, unauthorized, forbidden, notFound } from '@/lib/auth';
import { getPageAccess, canEdit } from '@/lib/access';

export const dynamic = 'force-dynamic';

// GET /api/pages/:id -> page info + my role
export async function GET(req, { params }) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { page, role } = await getPageAccess(user.id, params.id);
  if (!page) return notFound('Page not found');
  if (!role) return forbidden('You do not have access to this page');
  return NextResponse.json({ page, role });
}

// PATCH /api/pages/:id  { title }
export async function PATCH(req, { params }) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { page, role } = await getPageAccess(user.id, params.id);
  if (!page) return notFound('Page not found');
  if (!canEdit(role)) return forbidden('You can only view this page');

  const { title } = await req.json();
  const updated = await prisma.page.update({ where: { id: params.id }, data: { title: (title || '').trim() || 'Untitled' } });
  return NextResponse.json({ id: updated.id, title: updated.title });
}

// DELETE /api/pages/:id  (owner only)
export async function DELETE(req, { params }) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { page, role } = await getPageAccess(user.id, params.id);
  if (!page) return notFound('Page not found');
  if (role !== 'OWNER') return forbidden('Only the owner can delete pages');

  await prisma.page.delete({ where: { id: params.id } });
  return NextResponse.json({ message: 'Page deleted', workspaceId: page.workspaceId });
}
