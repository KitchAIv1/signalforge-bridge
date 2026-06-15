'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ROUTE_LINKS } from '@/components/navLinks';
import { getSupabase } from '@/lib/supabase';

export function Nav() {
  const pathname = usePathname();

  async function handleSignOut() {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <nav className="hidden h-full min-h-screen w-48 shrink-0 flex-col border-r border-slate-200 bg-white p-4 lg:flex">
      <div className="mb-6 font-semibold text-slate-800">SignalForge Bridge</div>
      <ul className="space-y-1">
        {NAV_ROUTE_LINKS.map(({ href, label }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <li key={href}>
              <Link
                href={href}
                className={`block min-h-[44px] rounded-lg px-3 py-3 text-sm leading-5 ${
                  isActive ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={handleSignOut}
          className="block w-full rounded-lg px-3 py-3 text-left text-sm text-slate-400 hover:bg-slate-50 hover:text-slate-600"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
