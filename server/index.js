// ---------------------------------------------------------------------------
// Real-time collaboration server (WebSocket + Yjs)
//
// - Every page is a "room" that holds one Yjs document in memory.
// - Browsers connect with y-websocket and exchange Yjs updates with the room.
// - Updates are saved to PostgreSQL (debounced), so a page survives restarts.
// - If REDIS_URL is set, every update is also published to Redis, so several
//   copies of this server (started with different WS_PORT) stay in sync.
// - Users with VIEW or COMMENT role can read and show their cursor, but any
//   edit they send is ignored by the server.
// ---------------------------------------------------------------------------
require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const Y = require('yjs');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const PORT = Number(process.env.WS_PORT) || 1234;
const INSTANCE_ID = crypto.randomUUID(); // lets us ignore our own Redis messages
const MSG_SYNC = 0;       // y-websocket message types
const MSG_AWARENESS = 1;  // cursors / who is online
const SAVE_DELAY = 2000;  // save to the database 2s after the last edit

if (!process.env.JWT_SECRET) {
  console.log('JWT_SECRET is missing in .env');
  process.exit(1);
}

/* ---------------- Redis (optional, for running many servers) ---------------- */
let pub = null;
let sub = null;
const channelRooms = new Map(); // redis channel name -> room

if (process.env.REDIS_URL) {
  pub = new Redis(process.env.REDIS_URL);
  sub = new Redis(process.env.REDIS_URL);
  pub.on('error', (e) => console.log('Redis error:', e.message));
  sub.on('error', (e) => console.log('Redis error:', e.message));

  // A message from another server instance: apply it to our copy of the room
  sub.on('message', (channel, raw) => {
    const room = channelRooms.get(channel);
    if (!room) return;
    const msg = JSON.parse(raw);
    if (msg.from === INSTANCE_ID) return;
    const bytes = Buffer.from(msg.data, 'base64');
    if (msg.kind === 'doc') Y.applyUpdate(room.doc, bytes, 'redis');
    else awarenessProtocol.applyAwarenessUpdate(room.awareness, bytes, 'redis');
  });
  console.log('Redis enabled: this server shares edits with other instances');
}

function publish(room, kind, bytes) {
  if (!pub) return;
  const payload = JSON.stringify({ from: INSTANCE_ID, kind, data: Buffer.from(bytes).toString('base64') });
  pub.publish(room.channel, payload).catch(() => {});
}

/* ---------------- Rooms ---------------- */
const rooms = new Map(); // pageId -> Promise<room>

function getRoom(pageId) {
  if (!rooms.has(pageId)) {
    rooms.set(pageId, createRoom(pageId).catch((err) => { rooms.delete(pageId); throw err; }));
  }
  return rooms.get(pageId);
}

function send(ws, message) {
  if (ws.readyState === 1) ws.send(message, (err) => { if (err) ws.close(); });
}

async function createRoom(pageId) {
  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null); // the server itself is not a "user"
  const room = { id: pageId, doc, awareness, conns: new Map(), channel: 'collab:' + pageId, timer: null };

  // subscribe first, then load, so we do not miss updates from other servers
  if (sub) {
    channelRooms.set(room.channel, room);
    await sub.subscribe(room.channel);
  }

  const page = await prisma.page.findUnique({ where: { id: pageId }, select: { content: true } });
  if (page && page.content) Y.applyUpdate(doc, page.content, 'load');

  // Any change to the document: send to every connected browser + Redis + schedule save
  doc.on('update', (update, origin) => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeUpdate(enc, update);
    const message = encoding.toUint8Array(enc);
    room.conns.forEach((_, conn) => send(conn, message));
    if (origin !== 'redis') publish(room, 'doc', update);
    if (origin !== 'load') scheduleSave(room);
  });

  // Cursor / presence changes
  awareness.on('update', ({ added, updated, removed }, origin) => {
    const changed = added.concat(updated, removed);
    // remember which awareness ids belong to which connection (to clean up on disconnect)
    if (origin && room.conns.has(origin)) {
      const ids = room.conns.get(origin);
      added.forEach((id) => ids.add(id));
      removed.forEach((id) => ids.delete(id));
    }
    const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changed);
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_AWARENESS);
    encoding.writeVarUint8Array(enc, update);
    const message = encoding.toUint8Array(enc);
    room.conns.forEach((_, conn) => send(conn, message));
    if (origin !== 'redis') publish(room, 'awareness', update);
  });

  return room;
}

/* ---------------- Saving to PostgreSQL ---------------- */
function scheduleSave(room) {
  clearTimeout(room.timer);
  room.timer = setTimeout(() => saveRoom(room), SAVE_DELAY);
}

async function saveRoom(room) {
  clearTimeout(room.timer);
  room.timer = null;
  try {
    await prisma.page.update({
      where: { id: room.id },
      data: { content: Buffer.from(Y.encodeStateAsUpdate(room.doc)) },
    });
  } catch (err) {
    console.log('Save failed for page', room.id, err.message);
  }
}

/* ---------------- One browser connection ---------------- */
function setupConnection(ws, room, canEdit) {
  ws.binaryType = 'arraybuffer';
  room.conns.set(ws, new Set());

  ws.on('message', (data) => {
    try {
      const message = new Uint8Array(data);
      const decoder = decoding.createDecoder(message);
      const type = decoding.readVarUint(decoder);

      if (type === MSG_SYNC) {
        // Read-only users may ask for the document (sync step 1) but cannot send changes
        if (!canEdit) {
          const peek = decoding.createDecoder(message);
          decoding.readVarUint(peek);
          if (decoding.readVarUint(peek) !== syncProtocol.messageYjsSyncStep1) return;
        }
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MSG_SYNC);
        syncProtocol.readSyncMessage(decoder, enc, room.doc, ws);
        if (encoding.length(enc) > 1) send(ws, encoding.toUint8Array(enc)); // reply, if any
      } else if (type === MSG_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), ws);
      }
    } catch (err) {
      console.log('Bad message:', err.message);
    }
  });

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('close', () => closeConnection(room, ws));
  ws.on('error', () => ws.close());

  // Start the handshake: tell the browser what we have, ask what it has
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_SYNC);
  syncProtocol.writeSyncStep1(enc, room.doc);
  send(ws, encoding.toUint8Array(enc));

  // Send who is already online
  const states = room.awareness.getStates();
  if (states.size > 0) {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MSG_AWARENESS);
    encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())));
    send(ws, encoding.toUint8Array(e));
  }
}

async function closeConnection(room, ws) {
  const ids = room.conns.get(ws);
  room.conns.delete(ws);
  if (ids) awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(ids), null);

  if (room.conns.size === 0) {
    await saveRoom(room);               // last person left: save now
    if (room.conns.size === 0) disposeRoom(room);
  }
}

function disposeRoom(room) {
  if (sub) {
    sub.unsubscribe(room.channel).catch(() => {});
    channelRooms.delete(room.channel);
  }
  room.awareness.destroy();
  room.doc.destroy();
  rooms.delete(room.id);
}

/* ---------------- HTTP + WebSocket server ---------------- */
const wss = new WebSocketServer({ noServer: true });
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Collaboration server is running\n');
});

// Browsers connect to ws://host:PORT/<pageId>?token=<jwt>
server.on('upgrade', async (req, socket, head) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pageId = url.pathname.slice(1);
    const { id: userId } = jwt.verify(url.searchParams.get('token') || '', process.env.JWT_SECRET);

    const page = await prisma.page.findUnique({ where: { id: pageId }, select: { workspaceId: true } });
    if (!page) throw new Error('page not found');
    const member = await prisma.member.findUnique({
      where: { workspaceId_userId: { workspaceId: page.workspaceId, userId } },
    });
    if (!member) throw new Error('no access');

    const canEdit = member.role === 'OWNER' || member.role === 'EDIT';
    const room = await getRoom(pageId);
    wss.handleUpgrade(req, socket, head, (ws) => setupConnection(ws, room, canEdit));
  } catch (err) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
  }
});

// Drop dead connections (laptop closed, network lost)
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Save everything when the server is stopped with Ctrl+C
process.on('SIGINT', async () => {
  for (const p of rooms.values()) {
    try { await saveRoom(await p); } catch (e) { /* ignore */ }
  }
  process.exit(0);
});

server.listen(PORT, () => console.log(`Collaboration server running on ws://localhost:${PORT}`));
