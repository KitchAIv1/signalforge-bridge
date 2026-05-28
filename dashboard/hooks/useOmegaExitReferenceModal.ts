'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

export type OmegaExitReferenceModalControls = {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
  panelId: string;
  titleId: string;
};

export function useOmegaExitReferenceModal(): OmegaExitReferenceModalControls {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const titleId = useId();

  useBodyScrollLock(isOpen);

  const openModal = useCallback(() => setIsOpen(true), []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnEscape(keyboardEvent: KeyboardEvent): void {
      if (keyboardEvent.key !== 'Escape') return;
      keyboardEvent.preventDefault();
      closeModal();
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, closeModal]);

  return { isOpen, openModal, closeModal, triggerRef, panelId, titleId };
}
