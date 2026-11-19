'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [message, setMessage] = useState('');

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      await api(isRegister ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: form });
      router.push('/');
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <form className="card auth" onSubmit={handleSubmit}>
      <h1>{isRegister ? 'Create account' : 'Welcome back'}</h1>
      <p className="muted">CollabSpace: write together, in real time.</p>
      {isRegister && (
        <>
          <label>Name</label>
          <input name="name" value={form.name} onChange={handleChange} required />
        </>
      )}
      <label>Email</label>
      <input name="email" type="email" value={form.email} onChange={handleChange} required />
      <label>Password</label>
      <input name="password" type="password" value={form.password} onChange={handleChange} required />
      {message && <p className="error">{message}</p>}
      <button type="submit">{isRegister ? 'Register' : 'Login'}</button>
      <p className="small">
        {isRegister ? 'Already registered? ' : 'New here? '}
        <button type="button" className="linkbtn" onClick={() => setIsRegister(!isRegister)}>
          {isRegister ? 'Login' : 'Create an account'}
        </button>
      </p>
    </form>
  );
}
