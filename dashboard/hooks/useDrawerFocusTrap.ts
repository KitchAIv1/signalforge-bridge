'use client';

import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDrawerFocusTrap(drawerOpen: boolean, panelRootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!drawerOpen || panelRootRef.current == null) return;
    const root = panelRootRef.current;

    function listFocusables(): HTMLElement[] {
      return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    }

    const firstFocusable = listFocusables()[0];
    firstFocusable?.focus();

    function onKeyDown(ev: KeyboardEvent): void {
      if (ev.key !== 'Tab') return;
      const ordered = listFocusables();
      if (ordered.length === 0) return;
      const boundaryFirst = ordered[0];
      const boundaryLast = ordered[ordered.length - 1];
      if (ev.shiftKey) {
        if (document.activeElement === boundaryFirst) {
          ev.preventDefault();
          boundaryLast.focus();
        }
      } else if (document.activeElement === boundaryLast) {
        ev.preventDefault();
        boundaryFirst.focus();
      }
    }

    root.addEventListener('keydown', onKeyDown);
    return () => root.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, panelRootRef]);
}
