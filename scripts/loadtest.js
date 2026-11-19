// Measures how fast an edit travels from one browser to all the others.
//
//   npm run loadtest -- <pageId> [clients=10] [rounds=30]
//
// Needs the web app and the WebSocket server running, and the demo users from `npm run seed`.
// It opens N fake "browsers", one of them changes a shared value, and we time how long the
// others take to see it. The numbers it prints are real measurements from your machine,
// so copy them into your test report.
require('dotenv').config();
const WebSocket = require('ws');
const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');

process.setMaxListeners(0); // many fake clients each add an exit listener
const [pageId, clientsArg, roundsArg] = process.argv.slice(2);
if (!pageId) {
  console.log('Usage: npm run loadtest -- <pageId> [clients=10] [rounds=30]');
  process.exit(1);
}
const CLIENTS = Number(clientsArg) || 10;
const ROUNDS = Number(roundsArg) || 30;
const WEB = process.env.WEB_URL || 'http://localhost:3000';
const WS = process.env.WS_URL || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const percentile = (arr, p) => arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))];

async function getToken() {
  if (process.env.TOKEN) return process.env.TOKEN; // use a token you already have
  const login = await fetch(WEB + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@collab.dev', password: 'password123' }),
  });
  if (!login.ok) throw new Error('Login failed. Did you run npm run seed?');
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const res = await fetch(WEB + '/api/ws-token', { headers: { Cookie: cookie } });
  return (await res.json()).token;
}

async function main() {
  const token = await getToken();

  // 1. connect all clients
  const t0 = Date.now();
  const clients = [];
  for (let i = 0; i < CLIENTS; i++) {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(WS, pageId, doc, { params: { token }, WebSocketPolyfill: WebSocket, disableBc: true });
    clients.push({ doc, provider, map: doc.getMap('loadtest'), synced: false });
    provider.on('sync', (s) => { clients[i].synced = s; });
  }
  while (clients.some((c) => !c.synced)) {
    if (Date.now() - t0 > 15000) throw new Error('Clients could not connect. Is the WebSocket server running?');
    await sleep(50);
  }
  const connectMs = Date.now() - t0;

  // 2. one client writes, the others listen
  const latencies = [];
  let currentRound = -1;
  const seen = new Set();
  clients.slice(1).forEach((c, idx) => {
    c.map.observe(() => {
      const v = c.map.get('msg');
      if (v && v.round === currentRound && !seen.has(`${currentRound}-${idx}`)) {
        seen.add(`${currentRound}-${idx}`);
        latencies.push(Date.now() - v.ts);
      }
    });
  });

  let lost = 0;
  for (let r = 0; r < ROUNDS; r++) {
    currentRound = r;
    clients[0].map.set('msg', { round: r, ts: Date.now() });
    const start = Date.now();
    while (latencies.length < (r + 1) * (CLIENTS - 1) - lost && Date.now() - start < 3000) await sleep(5);
    if (Date.now() - start >= 3000) lost += CLIENTS - 1 - [...seen].filter((k) => k.startsWith(r + '-')).length;
    await sleep(50);
  }

  // 3. report
  const avg = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);
  console.log('\n=== Sync load test ===');
  console.log(`Clients connected:     ${CLIENTS} (all synced in ${connectMs} ms)`);
  console.log(`Edits sent:            ${ROUNDS}`);
  console.log(`Deliveries expected:   ${ROUNDS * (CLIENTS - 1)}`);
  console.log(`Deliveries received:   ${latencies.length}`);
  console.log(`Latency avg / p95 / max: ${avg.toFixed(1)} / ${latencies.length ? percentile(latencies, 95) : '-'} / ${latencies.length ? Math.max(...latencies) : '-'} ms`);

  clients.forEach((c) => { c.provider.destroy(); c.doc.destroy(); });
  process.exit(0);
}

main().catch((e) => { console.log('Load test failed:', e.message); process.exit(1); });
