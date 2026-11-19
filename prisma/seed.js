// npm run seed  -> demo users, one workspace and one page
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('password123', 10);
  const people = [
    { email: 'alice@collab.dev', name: 'Alice', color: '#e5484d' },
    { email: 'bob@collab.dev', name: 'Bob', color: '#3e63dd' },
    { email: 'carol@collab.dev', name: 'Carol', color: '#30a46c' },
  ];
  const users = {};
  for (const p of people) {
    users[p.name] = await prisma.user.upsert({ where: { email: p.email }, update: {}, create: { ...p, password } });
  }

  let ws = await prisma.workspace.findFirst({ where: { name: 'Demo Workspace', ownerId: users.Alice.id } });
  if (!ws) {
    ws = await prisma.workspace.create({ data: { name: 'Demo Workspace', ownerId: users.Alice.id } });
    await prisma.member.createMany({
      data: [
        { workspaceId: ws.id, userId: users.Alice.id, role: 'OWNER' },
        { workspaceId: ws.id, userId: users.Bob.id, role: 'EDIT' },
        { workspaceId: ws.id, userId: users.Carol.id, role: 'VIEW' },
      ],
    });
    await prisma.page.create({ data: { workspaceId: ws.id, title: 'Meeting notes' } });
  }
  console.log('Seed done. Logins (password: password123):');
  console.log('  alice@collab.dev  (owner)\n  bob@collab.dev    (can edit)\n  carol@collab.dev  (view only)');
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
