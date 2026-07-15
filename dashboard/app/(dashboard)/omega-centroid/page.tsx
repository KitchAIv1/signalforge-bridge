'use client';

import { OmegaCentroidCheckPanel } from '@/components/omegaCentroid/OmegaCentroidCheckPanel';

export default function OmegaCentroidPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Omega Centroid Check
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Read-only view of the frozen w5/c0 DTW template and recent shadow fire
          distances. Does not change live matching.
        </p>
      </div>
      <OmegaCentroidCheckPanel />
    </div>
  );
}
