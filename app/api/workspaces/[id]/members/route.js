import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser, unauthorized, forbidden, badRequest } from '@/lib/auth';
import { getWorkspaceRole } from '@/lib/access';

export const dynamic = 'force-dynamic';

// POST /api/workspaces/:id/members  { email, role }  (owner only)
// Adds a person, or changes their role if they are already a member.
export async function POST(req, { params }) {
  const user = await getUser();
  if (!user) return unauthorized();
  if ((await getWorkspaceRole(user.id, params.id)) !== 'OWNER') return forbidden('Only the owner can manage members');

  const { email, role } = await req.json();
  if (!['EDIT', 'COMMENT', 'VIEW'].includes(role)) return badRequest('Role must be EDIT, COMMENT or VIEW');

  const person = await prisma.user.findUnique({ where: { email: (email || '').toLowerCase() } });
  if (!person) return badRequest('No user with this email. Ask them to register first.');
  if (person.id === user.id) return badRequest('You are the owner already');

  await prisma.member.upsert({
    where: { workspaceId_userId: { workspaceId: params.id, userId: person.id } },
    update: { role },
    create: { workspaceId: params.id, userId: person.id, role },
  });
  return NextResponse.json({ message: 'Member saved' });
}
