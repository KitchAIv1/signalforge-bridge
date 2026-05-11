'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ROUTE_LINKS } from '@/components/navLinks';

export function Nav() {
  const pathname = usePathname();

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
    </nav>
  );
}
