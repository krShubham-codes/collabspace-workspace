'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';

export default function Topbar({ user }) {
  const router = useRouter();
  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };
  return (
    <header className="topbar">
      <Link href="/" className="brand">CollabSpace</Link>
      {user && (
        <div className="topbar-right">
          <span className="avatar" style={{ background: user.color }}>{user.name[0]}</span>
          <span>{user.name}</span>
          <button className="ghost" onClick={logout}>Logout</button>
        </div>
      )}
    </header>
  );
}
