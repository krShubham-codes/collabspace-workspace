import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser, unauthorized, badRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/workspaces  -> workspaces I belong to
export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();

  const memberships = await prisma.member.findMany({
    where: { userId: user.id },
    include: { workspace: { include: { _count: { select: { pages: true, members: true } } } } },
    orderBy: { workspace: { createdAt: 'desc' } },
  });
  return NextResponse.json(
    memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      role: m.role,
      pages: m.workspace._count.pages,
      members: m.workspace._count.members,
    }))
  );
}

// POST /api/workspaces  { name }
export async function POST(req) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { name } = await req.json();
  if (!name || !name.trim()) return badRequest('Workspace name is required');

  const workspace = await prisma.workspace.create({
    data: {
      name: name.trim(),
      ownerId: user.id,
      members: { create: { userId: user.id, role: 'OWNER' } },
      pages: { create: { title: 'Welcome' } },
    },
  });
  return NextResponse.json(workspace, { status: 201 });
}
