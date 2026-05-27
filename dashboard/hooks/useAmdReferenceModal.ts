'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

export type AmdReferenceModalControls = {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
  panelId: string;
};

export function useAmdReferenceModal(): AmdReferenceModalControls {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useBodyScrollLock(isOpen);

  const openModal = useCallback(() => setIsOpen(true), []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(ev: KeyboardEvent): void {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        closeModal();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, closeModal]);

  return { isOpen, openModal, closeModal, triggerRef, panelId };
}
