'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push('/');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="mb-1 text-xl font-semibold text-slate-100">SignalForge</h1>
        <p className="mb-6 text-sm text-slate-400">Veredix Dashboard</p>
        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-slate-500 focus:outline-none"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-slate-500 focus:outline-none"
          />
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
