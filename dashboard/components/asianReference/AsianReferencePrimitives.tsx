'use client';

import type { ReactNode } from 'react';

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}

interface ReferenceTableProps {
  children: ReactNode;
}

interface EnumChipProps {
  children: ReactNode;
  tone?: 'sky' | 'emerald' | 'red' | 'amber' | 'slate';
}

const CHIP_TONES = {
  sky: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
  amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  slate: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300',
};

export function SectionHeading({ eyebrow, title, children }: SectionHeadingProps) {
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-500 dark:text-sky-400">
        {eyebrow}
      </p>
      <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {children && <p className="mt-1 max-w-3xl text-xs text-slate-500 dark:text-slate-400">{children}</p>}
    </div>
  );
}

export function ReferenceTable({ children }: ReferenceTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="min-w-full text-left text-xs">{children}</table>
    </div>
  );
}

export function TH({ children }: { children: ReactNode }) {
  return (
    <th className="bg-slate-50 px-3 py-2 font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      {children}
    </th>
  );
}

export function TD({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <td className={`border-t border-slate-100 px-3 py-2 align-top text-slate-600 dark:border-slate-800 dark:text-slate-300 ${className}`}>
      {children}
    </td>
  );
}

export function EnumChip({ children, tone = 'slate' }: EnumChipProps) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold ${CHIP_TONES[tone]}`}>
      {children}
    </span>
  );
}
