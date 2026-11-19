'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { useUser } from '@/lib/useUser';
import Topbar from '@/components/Topbar';

export default function Dashboard() {
  const user = useUser();
  const [workspaces, setWorkspaces] = useState([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  const load = () => api('/api/workspaces').then(setWorkspaces).catch((e) => setMessage(e.message));

  useEffect(() => { if (user) load(); }, [user]);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api('/api/workspaces', { method: 'POST', body: { name } });
      setName('');
      load();
    } catch (err) {
      setMessage(err.message);
    }
  };

  if (!user) return null;

  return (
    <>
      <Topbar user={user} />
      <main className="container">
        <h1>Your workspaces</h1>
        {message && <p className="error">{message}</p>}
        <div className="grid">
          {workspaces.map((w) => (
            <Link key={w.id} href={`/workspace/${w.id}`} className="card tile">
              <h3>{w.name}</h3>
              <p className="muted small">{w.pages} pages · {w.members} members</p>
              <span className={`badge ${w.role}`}>{w.role}</span>
            </Link>
          ))}
        </div>
        {workspaces.length === 0 && <p className="muted">You are not in any workspace yet. Create one below.</p>}

        <form className="row" onSubmit={create}>
          <input placeholder="New workspace name" value={name} onChange={(e) => setName(e.target.value)} required />
          <button type="submit">Create workspace</button>
        </form>
      </main>
    </>
  );
}
