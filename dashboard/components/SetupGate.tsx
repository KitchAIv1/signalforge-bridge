'use client';

import { hasSupabaseEnv } from '@/lib/supabase';

export function SetupGate({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseEnv()) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <h1 className="text-lg font-semibold">Dashboard setup required</h1>
          <p className="mt-1 text-sm font-medium">Use <strong>http://localhost:3001</strong> (port 3001).</p>
          <p className="mt-2 text-sm">
            Create <code className="rounded bg-amber-100 px-1">dashboard/.env.local</code> with:
          </p>
          <pre className="mt-3 overflow-x-auto rounded bg-slate-800 p-3 text-left text-sm text-slate-100">
            {`NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key`}
          </pre>
          <p className="mt-3 text-sm">
            Copy from <code className="rounded bg-amber-100 px-1">.env.local.example</code> and use your Supabase project URL and anon (public) key from Project Settings → API.
          </p>
          <p className="mt-2 text-sm font-medium">Then restart: <code className="rounded bg-amber-100 px-1">npm run dev</code></p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
