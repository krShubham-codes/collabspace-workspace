import { prisma } from './prisma';

// Roles: OWNER > EDIT > COMMENT > VIEW
export const canEdit = (role) => role === 'OWNER' || role === 'EDIT';
export const canComment = (role) => canEdit(role) || role === 'COMMENT';

export async function getWorkspaceRole(userId, workspaceId) {
  const m = await prisma.member.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  return m ? m.role : null;
}

// Finds a page and the user's role in the page's workspace
export async function getPageAccess(userId, pageId) {
  const page = await prisma.page.findUnique({ where: { id: pageId }, select: { id: true, title: true, workspaceId: true } });
  if (!page) return { page: null, role: null };
  const role = await getWorkspaceRole(userId, page.workspaceId);
  return { page, role };
}
