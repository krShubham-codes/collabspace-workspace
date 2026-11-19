import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser, unauthorized, forbidden } from '@/lib/auth';
import { getWorkspaceRole, canEdit } from '@/lib/access';

export const dynamic = 'force-dynamic';

// POST /api/workspaces/:id/pages  { title }
export async function POST(req, { params }) {
  const user = await getUser();
  if (!user) return unauthorized();
  if (!canEdit(await getWorkspaceRole(user.id, params.id))) return forbidden('You can only view this workspace');

  const { title } = await req.json();
  const page = await prisma.page.create({ data: { workspaceId: params.id, title: (title || '').trim() || 'Untitled' } });
  return NextResponse.json(page, { status: 201 });
}
