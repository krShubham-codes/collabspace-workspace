'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client';
import { useUser } from '@/lib/useUser';
import Topbar from '@/components/Topbar';

export default function WorkspacePage() {
  const { id } = useParams();
  const router = useRouter();
  const user = useUser();
  const [ws, setWs] = useState(null);
  const [title, setTitle] = useState('');
  const [invite, setInvite] = useState({ email: '', role: 'EDIT' });
  const [message, setMessage] = useState('');

  const load = () => api(`/api/workspaces/${id}`).then(setWs).catch((e) => setMessage(e.message));

  useEffect(() => { if (user) load(); }, [user, id]);

  const createPage = async (e) => {
    e.preventDefault();
    try {
      const page = await api(`/api/workspaces/${id}/pages`, { method: 'POST', body: { title } });
      router.push(`/page/${page.id}`);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const addMember = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      await api(`/api/workspaces/${id}/members`, { method: 'POST', body: invite });
      setInvite({ email: '', role: 'EDIT' });
      setMessage('Member saved.');
      load();
    } catch (err) {
      setMessage(err.message);
    }
  };

  if (!user) return null;
  const canEdit = ws && (ws.role === 'OWNER' || ws.role === 'EDIT');

  return (
    <>
      <Topbar user={user} />
      <main className="container">
        <Link href="/" className="muted small">← All workspaces</Link>
        {!ws ? <p>{message || 'Loading...'}</p> : (
          <>
            <h1>{ws.name} <span className={`badge ${ws.role}`}>{ws.role}</span></h1>
            {message && <p className="notice">{message}</p>}

            <h3>Pages</h3>
            {ws.pages.map((p) => (
              <Link key={p.id} href={`/page/${p.id}`} className="card listrow">
                <strong>{p.title}</strong>
                <span className="muted small">updated {new Date(p.updatedAt).toLocaleString()}</span>
              </Link>
            ))}
            {canEdit && (
              <form className="row" onSubmit={createPage}>
                <input placeholder="New page title" value={title} onChange={(e) => setTitle(e.target.value)} />
                <button type="submit">New page</button>
              </form>
            )}

            <h3>Members</h3>
            {ws.members.map((m) => (
              <div key={m.id} className="card listrow">
                <span><span className="avatar" style={{ background: m.color }}>{m.name[0]}</span> {m.name} <span className="muted small">{m.email}</span></span>
                <span className={`badge ${m.role}`}>{m.role}</span>
              </div>
            ))}
            {ws.role === 'OWNER' && (
              <form className="row" onSubmit={addMember}>
                <input type="email" placeholder="Email of a registered user" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required />
                <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
                  <option value="EDIT">Can edit</option>
                  <option value="COMMENT">Can comment</option>
                  <option value="VIEW">Can view</option>
                </select>
                <button type="submit">Add / change role</button>
              </form>
            )}
          </>
        )}
      </main>
    </>
  );
}
