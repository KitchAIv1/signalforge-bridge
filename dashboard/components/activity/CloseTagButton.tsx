'use client';

import { useState } from 'react';
import { useCloseTag, type CloseTagValue } from '@/hooks/useCloseTag';

const TAG_OPTIONS: { value: CloseTagValue; label: string; color: string }[] = [
  { value: 'trail_correct', label: '✅ Correct exit', color: 'text-green-700 dark:text-green-400' },
  {
    value: 'would_close_earlier',
    label: '⚡ Closed too late',
    color: 'text-yellow-700 dark:text-yellow-400',
  },
  {
    value: 'would_hold_longer',
    label: '⏳ Closed too early',
    color: 'text-blue-700 dark:text-blue-400',
  },
  {
    value: 'wrong_direction',
    label: '🔄 Wrong direction',
    color: 'text-red-700 dark:text-red-400',
  },
];

function parseTag(raw: string | null): { tag: CloseTagValue | null; note: string | null } {
  if (!raw) return { tag: null, note: null };
  const [tagPart, notePart] = raw.split('::');
  const tagValues: CloseTagValue[] = TAG_OPTIONS.map((o) => o.value);
  const tagNorm = tagPart as CloseTagValue;
  const tagValid = tagValues.includes(tagNorm) ? tagNorm : null;
  return {
    tag: tagValid,
    note: notePart ?? null,
  };
}

interface CloseTagButtonProps {
  tradeId: string;
  currentTag: string | null;
  closeReason: string | null;
  pnlR: number | null;
}

export function CloseTagButton({
  tradeId,
  currentTag,
  closeReason,
  pnlR,
}: CloseTagButtonProps) {
  const { saveTag, isSaving } = useCloseTag();
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<CloseTagValue | null>(null);

  const { tag: existingTag } = parseTag(currentTag);
  const activeTag = saved ?? existingTag;

  async function handleTag(value: CloseTagValue): Promise<void> {
    await saveTag(tradeId, value, note.trim() || undefined);
    setSaved(value);
    setIsOpen(false);
    setNote('');
  }

  if (!closeReason || closeReason === 'open') return null;

  if (activeTag) {
    const option = TAG_OPTIONS.find((o) => o.value === activeTag);
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`text-xs ${option?.color ?? 'text-slate-500'} hover:underline`}
        title="Click to change tag"
      >
        {option?.label ?? activeTag}
      </button>
    );
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-xs text-slate-400 hover:text-slate-600 underline dark:hover:text-slate-300"
      >
        Tag exit
      </button>
    );
  }

  return (
    <div className="min-w-[180px] space-y-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {closeReason} ·{' '}
        {pnlR != null ? (pnlR >= 0 ? '+' : '') + pnlR.toFixed(2) + 'R' : '—'}
      </p>
      {TAG_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={isSaving}
          onClick={() => void handleTag(opt.value)}
          className={`block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-700 ${opt.color} disabled:opacity-50`}
        >
          {opt.label}
        </button>
      ))}
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note…"
        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
        maxLength={120}
      />
      <button
        type="button"
        onClick={() => setIsOpen(false)}
        className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
      >
        Cancel
      </button>
    </div>
  );
}
