'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { NAV_ROUTE_LINKS } from '@/components/navLinks';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useDrawerFocusTrap } from '@/hooks/useDrawerFocusTrap';
import { getSupabase } from '@/lib/supabase';

export function MobileNavDrawer() {
  const pathname = usePathname();
  const [panelOpen, setPanelOpen] = useState(false);
  const panelHostId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRootRef = useRef<HTMLElement>(null);
  useBodyScrollLock(panelOpen);
  useDrawerFocusTrap(panelOpen, panelRootRef);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  useEffect(() => {
    closePanel();
  }, [pathname, closePanel]);

  useEffect(() => {
    if (!panelOpen) return;
    function onKeyDown(ev: KeyboardEvent): void {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        setPanelOpen(false);
        queueMicrotask(() => triggerRef.current?.focus());
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panelOpen]);

  function openDrawer(): void {
    setPanelOpen(true);
  }

  function closeAndReturnFocus(): void {
    setPanelOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }

  function onBackdropActivate(): void {
    closeAndReturnFocus();
  }

  async function handleSignOut() {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-[48px] items-center gap-3 border-b border-slate-200 bg-white px-safe py-3 lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50"
        aria-expanded={panelOpen}
        aria-controls={panelHostId}
        onClick={() => (panelOpen ? closeAndReturnFocus() : openDrawer())}
      >
        Menu
      </button>
      <span className="text-sm font-semibold text-slate-800">SignalForge Bridge</span>

      {panelOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px]"
            aria-hidden
            tabIndex={-1}
            onClick={onBackdropActivate}
          />
          <aside
            ref={panelRootRef}
            id={panelHostId}
            className="fixed left-0 top-0 z-50 flex h-full w-[min(16rem,calc(100vw-3rem))] flex-col border-r border-slate-100 bg-white shadow-xl"
          >
            <div className="px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] font-semibold text-slate-800">
              Navigate
            </div>
            <nav className="flex-1 overflow-y-auto px-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
              <ul className="space-y-1">
                {NAV_ROUTE_LINKS.map(({ href, label }) => {
                  const isActive =
                    pathname === href || (href !== '/' && pathname.startsWith(href));
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className={`block min-h-[44px] rounded-lg px-3 py-3 text-sm leading-5 ${
                          isActive
                            ? 'bg-slate-100 font-medium text-slate-900'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="border-t border-slate-100 px-3 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
              <button
                type="button"
                onClick={handleSignOut}
                className="block w-full rounded-lg px-3 py-3 text-left text-sm text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                Sign out
              </button>
            </div>
          </aside>
        </>
      )}
    </header>
  );
}
