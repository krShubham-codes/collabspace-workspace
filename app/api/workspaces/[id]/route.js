import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser, unauthorized, forbidden, notFound } from '@/lib/auth';
import { getWorkspaceRole } from '@/lib/access';

export const dynamic = 'force-dynamic';

// GET /api/workspaces/:id  -> workspace, my role, pages and members
export async function GET(req, { params }) {
  const user = await getUser();
  if (!user) return unauthorized();

  const role = await getWorkspaceRole(user.id, params.id);
  if (!role) return forbidden('You are not a member of this workspace');

  const workspace = await prisma.workspace.findUnique({
    where: { id: params.id },
    include: {
      pages: { select: { id: true, title: true, updatedAt: true }, orderBy: { updatedAt: 'desc' } },
      members: { include: { user: { select: { id: true, name: true, email: true, color: true } } } },
    },
  });
  if (!workspace) return notFound('Workspace not found');

  return NextResponse.json({
    id: workspace.id,
    name: workspace.name,
    role,
    pages: workspace.pages,
    members: workspace.members.map((m) => ({ ...m.user, role: m.role })),
  });
}
