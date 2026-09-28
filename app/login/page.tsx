'use client';

import { FormEvent, useState } from 'react';
import { createClient } from '../../lib/supabase/browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError('Email o password non corrette.'); setLoading(false); return; }
    window.location.href = '/';
  }

  return <main className="loginPage">
    <div className="loginCard panel">
      <img src="/logo_verde.jpeg" alt="ASD Villanovese" className="loginLogo" />
      <span className="eyebrow">ASD VILLANOVESE</span>
      <h1>Analytics</h1>
      <p>Accedi alla piattaforma statistiche.</p>
      <form onSubmit={submit}>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {error && <div className="loginError">{error}</div>}
        <button className="loginButton" disabled={loading}>{loading ? 'Accesso…' : 'Accedi'}</button>
      </form>
    </div>
  </main>;
}
