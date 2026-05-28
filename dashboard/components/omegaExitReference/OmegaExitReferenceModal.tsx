'use client';

import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useOmegaExitReferenceModal } from '@/hooks/useOmegaExitReferenceModal';
import { useDrawerFocusTrap } from '@/hooks/useDrawerFocusTrap';
import { OmegaExitReferenceContent } from '@/components/omegaExitReference/OmegaExitReferenceContent';

function ReferenceCircleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function ReferenceTrigger({
  isOpen,
  openModal,
  panelId,
  triggerRef,
}: Pick<
  ReturnType<typeof useOmegaExitReferenceModal>,
  'isOpen' | 'openModal' | 'panelId' | 'triggerRef'
>) {
  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={openModal}
      aria-label="Open Omega exit strategy reference"
      aria-expanded={isOpen}
      aria-controls={panelId}
      title="Omega Exit Strategy Reference"
      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-violet-300 text-violet-500 transition-colors hover:border-violet-500 hover:text-violet-700 dark:border-violet-700 dark:text-violet-400 dark:hover:border-violet-500 dark:hover:text-violet-300"
    >
      <ReferenceCircleIcon />
    </button>
  );
}

function ReferenceBackdrop({ closeModal }: { closeModal: () => void }) {
  return (
    <button
      type="button"
      className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm"
      aria-hidden
      tabIndex={-1}
      onClick={closeModal}
    />
  );
}

function ReferenceHeader({ closeModal, titleId }: { closeModal: () => void; titleId: string }) {
  return (
    <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-500 dark:text-violet-400">
          Omega Engine
        </p>
        <h2 id={titleId} className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Exit Strategy Reference
        </h2>
      </div>
      <button
        type="button"
        onClick={closeModal}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        aria-label="Close Omega exit reference panel"
      >
        x
      </button>
    </div>
  );
}

function ReferenceDialog({
  closeModal,
  panelId,
  titleId,
}: Pick<ReturnType<typeof useOmegaExitReferenceModal>, 'closeModal' | 'panelId' | 'titleId'>) {
  const panelRef = useRef<HTMLElement | null>(null);
  useDrawerFocusTrap(true, panelRef);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <section
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <ReferenceHeader closeModal={closeModal} titleId={titleId} />
        <div className="overflow-y-auto">
          <OmegaExitReferenceContent />
        </div>
      </section>
    </div>
  );
}

export function OmegaExitReferenceModal() {
  const controls = useOmegaExitReferenceModal();
  const dialog = (
    <>
      <ReferenceBackdrop closeModal={controls.closeModal} />
      <ReferenceDialog {...controls} />
    </>
  );

  return (
    <>
      <ReferenceTrigger {...controls} />
      {controls.isOpen && createPortal(dialog, document.body)}
    </>
  );
}
