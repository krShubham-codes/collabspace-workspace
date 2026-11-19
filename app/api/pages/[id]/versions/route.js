import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser, unauthorized, forbidden, notFound, badRequest } from '@/lib/auth';
import { getPageAccess, canEdit } from '@/lib/access';

export const dynamic = 'force-dynamic';

// GET /api/pages/:id/versions  -> list of snapshots (without the big data)
export async function GET(req, { params }) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { page, role } = await getPageAccess(user.id, params.id);
  if (!page) return notFound('Page not found');
  if (!role) return forbidden();

  const versions = await prisma.version.findMany({
    where: { pageId: params.id },
    select: { id: true, label: true, createdAt: true, user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(versions);
}

// POST /api/pages/:id/versions  { label, state }   state = base64 Yjs state from the browser
export async function POST(req, { params }) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { page, role } = await getPageAccess(user.id, params.id);
  if (!page) return notFound('Page not found');
  if (!canEdit(role)) return forbidden('You cannot save versions');

  const { label, state } = await req.json();
  if (!state) return badRequest('Snapshot data is missing');

  const version = await prisma.version.create({
    data: {
      pageId: params.id,
      userId: user.id,
      label: (label || '').trim() || 'Snapshot',
      state: Buffer.from(state, 'base64'),
    },
    select: { id: true, label: true, createdAt: true },
  });
  return NextResponse.json(version, { status: 201 });
}
