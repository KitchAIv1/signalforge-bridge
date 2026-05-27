'use client';

import { useAmdReferenceModal } from '@/hooks/useAmdReferenceModal';
import { AmdReferenceContent } from '@/components/amdReference/AmdReferenceContent';

function InfoCircleIcon() {
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

export function AmdReferenceModal() {
  const { isOpen, openModal, closeModal, triggerRef, panelId } =
    useAmdReferenceModal();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openModal}
        aria-expanded={isOpen}
        aria-controls={panelId}
        title="AMD System Reference"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-600 dark:border-slate-600 dark:text-slate-500 dark:hover:border-slate-500 dark:hover:text-slate-300"
      >
        <InfoCircleIcon />
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm"
            aria-hidden
            tabIndex={-1}
            onClick={closeModal}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <section
              id={panelId}
              role="dialog"
              aria-modal="true"
              aria-labelledby="amd-ref-title"
              className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
                <h2
                  id="amd-ref-title"
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  AMD System Reference
                </h2>
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                  aria-label="Close reference panel"
                >
                  ✕
                </button>
              </div>
              <div className="overflow-y-auto">
                <AmdReferenceContent />
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
