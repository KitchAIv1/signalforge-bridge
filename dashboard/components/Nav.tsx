'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Overview' },
  { href: '/activity', label: 'Activity' },
  { href: '/health', label: 'Health' },
  { href: '/settings', label: 'Settings' },
  { href: '/omega', label: 'Omega Shadow' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="w-48 border-r border-slate-200 bg-white p-4">
      <div className="mb-6 font-semibold text-slate-800">SignalForge Bridge</div>
      <ul className="space-y-1">
        {links.map(({ href, label }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <li key={href}>
              <Link
                href={href}
                className={`block rounded px-3 py-2 text-sm ${
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
