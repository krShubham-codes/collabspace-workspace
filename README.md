# CollabSpace: Real-Time Collaborative Workspace (Notion/Figma style)

Several people edit the same page at once, see each other's cursors, and never lose changes.

**Stack:** Next.js 14 · WebSockets (`ws`) · Yjs (CRDT) · TipTap editor · PostgreSQL · Prisma · Redis

## Features
- Register / login (JWT in an httpOnly cookie), workspaces and pages
- Rich-text editor (TipTap) connected to a shared Yjs document
- WebSocket server that syncs edits live, and saves every page to PostgreSQL
- Presence: coloured cursors with names, and avatars of who is online
- Roles per workspace: **OWNER, EDIT, COMMENT, VIEW** (enforced on the server, not only in the UI)
- Comments on pages
- Version history: save named snapshots and restore them
- Redis pub/sub so several WebSocket servers stay in sync (horizontal scaling)
- Load-test script that measures sync latency

## Architecture

```
 Browser A ──┐                                   ┌── Browser C
 (TipTap+Yjs)│ WebSocket                WebSocket│ (TipTap+Yjs)
             ▼                                   ▼
        ┌──────────┐   Redis pub/sub (updates   ┌──────────┐
        │ WS server│◄──────── + presence) ─────►│ WS server│
        │  :1234   │                            │  :1235   │
        └────┬─────┘                            └────┬─────┘
             │  save / load Yjs state (Prisma)       │
             ▼                                       ▼
        ┌────────────────────── PostgreSQL ──────────────────────┐
        │ User · Workspace · Member(role) · Page · Comment · Version │
        └────────────────────────▲───────────────────────────────┘
                                 │ REST API (Prisma)
                         Next.js app :3000
              (login, workspaces, pages, comments, versions, ws-token)
```

**Why a CRDT (Yjs)?** Every edit is recorded as an operation with a unique id, and Yjs merges operations from everyone in a way that always ends in the same document, in any order. So if two people type in the same sentence, or someone was offline for a minute, nothing is overwritten and nobody has to "resolve a conflict".

**How a page gets live:**
1. The page asks `/api/ws-token` for a short-lived JWT, then connects to `ws://server/<pageId>?token=...`.
2. The WebSocket server verifies the token and checks the user's role for that page's workspace.
3. Both sides exchange what they have (Yjs "sync step 1 and 2"), then send small updates as people type.
4. The server applies each update to its in-memory document, forwards it to the other browsers, publishes it to Redis, and saves to PostgreSQL 2 seconds after the last edit.
5. VIEW and COMMENT users can read and show a cursor, but any change they send is ignored by the server.

## Setup

You need Node.js 18+, PostgreSQL and (optionally) Redis. With Docker Desktop:
```bash
docker compose up -d        # PostgreSQL on 5432, Redis on 6379
```
Then:
```bash
npm install
cp .env.example .env        # set JWT_SECRET; set REDIS_URL=redis://localhost:6379 to use Redis
npm run db:push             # creates the tables
npm run seed                # demo users, workspace, page
npm run dev:all             # web app on :3000 + WebSocket server on :1234
```
Open http://localhost:3000 and log in (password `password123`):

| User | Role in "Demo Workspace" |
|---|---|
| alice@collab.dev | OWNER |
| bob@collab.dev | EDIT |
| carol@collab.dev | VIEW |

## How to test with several browsers
Use different browsers (or a normal window plus an incognito window), because one browser keeps one login.
1. Alice in Chrome, Bob in Edge/Firefox, Carol in a private window. Open the same page.
2. Type in all three. Edits should appear live, with coloured cursors and avatars.
3. Carol (VIEW) can read but not type, and cannot comment.
4. Bob saves a snapshot, types more, then restores the snapshot. All windows update.
5. Disconnect one browser's network for a moment, type, reconnect: the changes merge.

### Testing Redis scaling
```bash
# .env must have REDIS_URL=redis://localhost:6379
npm run ws                       # terminal 1: server on :1234
WS_PORT=1235 npm run ws          # terminal 2: second server on :1235 (Windows PowerShell: $env:WS_PORT=1235; npm run ws)
```
Open the page normally in one browser (uses :1234) and open the same page in another with `?ws=ws://localhost:1235` added to the URL (uses :1235). Edits and cursors should still appear in both.

### Load test (gives you real numbers for the report)
```bash
npm run loadtest -- <pageId> 10 30     # 10 clients, 30 edits
npm run loadtest -- <pageId> 50 30
```
The page id is the last part of the page URL. Record the printed latency numbers in your test report, along with your machine details. Run it with and without Redis if you want a comparison.

## Test plan (fill the Result column yourself)

| No. | Test | Expected | Result |
|---|---|---|---|
| 1 | Register and login | Account created, redirected to workspaces | |
| 2 | Create workspace and page | Appear in the list | |
| 3 | Two users type in the same page | Both see changes within a second | |
| 4 | Two users type in the same sentence | Both edits kept, same final text | |
| 5 | Cursors and avatars | Names and colours visible | |
| 6 | VIEW user tries to type | Editor is read-only; server ignores changes | |
| 7 | COMMENT user | Can comment, cannot edit | |
| 8 | Comments | Appear for other users within ~5 s | |
| 9 | Snapshot, edit, restore | Content returns to the snapshot in all windows | |
| 10 | Close all tabs, reopen page | Content is still there (saved in PostgreSQL) | |
| 11 | Restart WebSocket server | Content is still there | |
| 12 | Two servers with Redis | Edits cross between servers | |
| 13 | Wrong token / non-member | Connection refused | |
| 14 | Load test 10 and 50 clients | Record avg / p95 / max latency | |

## Folder structure
```
app/               Next.js pages and API routes
  api/             auth, workspaces, pages, comments, versions, ws-token
  login/ workspace/[id]/ page/[id]/
components/        PageView (connection + presence), TipTapEditor, SidePanel (comments, history), Topbar
lib/               prisma client, auth helpers, role checks, fetch helper, base64 helpers
server/index.js    WebSocket + Yjs server (rooms, permissions, persistence, Redis)
scripts/loadtest.js  latency measurement
prisma/            schema.prisma, seed.js
```

## API summary
| Method | Route | Who |
|---|---|---|
| POST | /api/auth/register, /login, /logout | public |
| GET | /api/auth/me, /api/ws-token | logged in |
| GET, POST | /api/workspaces | logged in |
| GET | /api/workspaces/:id | member |
| POST | /api/workspaces/:id/members | owner |
| POST | /api/workspaces/:id/pages | edit+ |
| GET, PATCH, DELETE | /api/pages/:id | member / edit+ / owner |
| GET, POST | /api/pages/:id/comments | member / comment+ |
| GET, POST | /api/pages/:id/versions | member / edit+ |
| GET | /api/pages/:id/versions/:vid | member |

## Deployment
- **Next.js app:** Vercel (set `DATABASE_URL`, `JWT_SECRET`, `NEXT_PUBLIC_WS_URL`).
- **WebSocket server:** needs a long-running server (Render, Railway, Fly.io). Vercel cannot host it. Run `npm run ws` with the same `DATABASE_URL`, `JWT_SECRET` and (optional) `REDIS_URL`. Use `wss://` in `NEXT_PUBLIC_WS_URL`.
- **PostgreSQL:** Neon, Supabase or Render. **Redis:** Upstash or Redis Cloud. Run `npx prisma db push` once against the production database.

## Known limitations (be upfront about these)
- Permissions are per workspace, not per page.
- Comments are page-level (not attached to a text selection) and refresh by polling every 5 seconds.
- A restored version is applied as a new change, so it is recorded in the history of the live document rather than rewinding it.
- Snapshots store the whole document each time, which is fine for notes but not for huge documents.
- The Redis setup shares updates between servers; it has no leader election or automatic failover.
- No automated unit tests; testing is by the test plan above and the load-test script.
