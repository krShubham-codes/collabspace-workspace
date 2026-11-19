'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './client';

// Returns the logged in user, or sends the visitor to /login
export function useUser() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  useEffect(() => {
    api('/api/auth/me').then((d) => setUser(d.user)).catch(() => router.push('/login'));
  }, [router]);
  return user;
}
