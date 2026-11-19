'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { api } from '@/lib/client';
import { useUser } from '@/lib/useUser';
import Topbar from './Topbar';
import TipTapEditor from './TipTapEditor';
import SidePanel from './SidePanel';

export default function PageView({ id }) {
  const user = useUser();
  const [info, setInfo] = useState(null);      // { page, role }
  const [title, setTitle] = useState('');
  const [token, setToken] = useState(null);    // token for the WebSocket server
  const [collab, setCollab] = useState(null);  // { ydoc, provider }
  const [status, setStatus] = useState('connecting');
  const [online, setOnline] = useState([]);
  const [message, setMessage] = useState('');

  // 1. load the page info and a token for the WebSocket server
  useEffect(() => {
    if (!user) return;
    Promise.all([api(`/api/pages/${id}`), api('/api/ws-token')])
      .then(([pageInfo, t]) => {
        setInfo(pageInfo);
        setTitle(pageInfo.page.title);
        setToken(t.token);
      })
      .catch((e) => setMessage(e.message));
  }, [user, id]);

  // 2. open the real-time connection
  useEffect(() => {
    if (!token) return;
    // ?ws=ws://localhost:1235 lets you pick another server (used to test Redis scaling)
    const override = new URLSearchParams(window.location.search).get('ws');
    const wsUrl = override || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234';

    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(wsUrl, id, ydoc, { params: { token } });

    provider.on('status', (e) => setStatus(e.status));

    // who is online: read every browser's "user" from the awareness state
    const updateOnline = () => {
      const seen = new Map();
      provider.awareness.getStates().forEach((state) => {
        if (state.user) seen.set(state.user.id, state.user);
      });
      setOnline(Array.from(seen.values()));
    };
    provider.awareness.on('change', updateOnline);

    setCollab({ ydoc, provider });
    return () => {
      provider.destroy();
      ydoc.destroy();
      setCollab(null);
      setOnline([]);
    };
  }, [token, id]);

  const saveTitle = async () => {
    try {
      await api(`/api/pages/${id}`, { method: 'PATCH', body: { title } });
    } catch (err) {
      setMessage(err.message);
    }
  };

  if (!user) return null;
  if (!info) return (<><Topbar user={user} /><main className="container"><p>{message || 'Loading...'}</p></main></>);

  const role = info.role;
  const editable = role === 'OWNER' || role === 'EDIT';

  return (
    <>
      <Topbar user={user} />
      <main className="page-layout">
        <section className="page-main">
          <Link href={`/workspace/${info.page.workspaceId}`} className="muted small">← Back to workspace</Link>

          <div className="page-head">
            <input
              className="title-input"
              value={title}
              readOnly={!editable}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => editable && saveTitle()}
            />
            <div className="presence">
              <span className={`status ${status}`}>{status}</span>
              {online.map((u) => (
                <span key={u.id} className="avatar" style={{ background: u.color }} title={u.name}>{u.name[0]}</span>
              ))}
            </div>
          </div>

          <p className="muted small">
            Your role: <span className={`badge ${role}`}>{role}</span>
            {!editable && ' You can read this page but not change it.'}
          </p>
          {message && <p className="error">{message}</p>}

          {collab && (
            <TipTapEditor ydoc={collab.ydoc} provider={collab.provider} user={user} editable={editable} />
          )}
        </section>

        <SidePanel pageId={id} role={role} ydoc={collab?.ydoc} />
      </main>
    </>
  );
}
