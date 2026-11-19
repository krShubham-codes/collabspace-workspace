import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser, unauthorized, forbidden, notFound } from '@/lib/auth';
import { getPageAccess } from '@/lib/access';

export const dynamic = 'force-dynamic';

// GET /api/pages/:id/versions/:vid -> the snapshot data (base64), used for restoring
export async function GET(req, { params }) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { page, role } = await getPageAccess(user.id, params.id);
  if (!page) return notFound('Page not found');
  if (!role) return forbidden();

  const version = await prisma.version.findFirst({ where: { id: params.vid, pageId: params.id } });
  if (!version) return notFound('Version not found');
  return NextResponse.json({ id: version.id, label: version.label, state: Buffer.from(version.state).toString('base64') });
}
