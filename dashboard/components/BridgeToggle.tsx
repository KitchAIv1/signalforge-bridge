'use client';

import { useCallback, useState } from 'react';

interface BridgeToggleProps {
  bridgeActive: boolean;
  onToggle: (next: boolean) => Promise<void>;
}

export function BridgeToggle({ bridgeActive, onToggle }: BridgeToggleProps) {
  const [loading, setLoading] = useState(false);

  const handleChange = useCallback(async () => {
    setLoading(true);
    try {
      await onToggle(!bridgeActive);
    } finally {
      setLoading(false);
    }
  }, [bridgeActive, onToggle]);

  return (
    <label className="flex cursor-pointer items-center gap-2">
      <span className="text-sm font-medium text-slate-700">Bridge</span>
      <button
        type="button"
        role="switch"
        aria-checked={bridgeActive}
        disabled={loading}
        onClick={handleChange}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          bridgeActive ? 'bg-emerald-500' : 'bg-slate-300'
        } ${loading ? 'opacity-70' : ''}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            bridgeActive ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      <span className={`text-sm font-medium ${bridgeActive ? 'text-emerald-700' : 'text-slate-500'}`}>
        {bridgeActive ? 'ON' : 'OFF'}
      </span>
    </label>
  );
}
