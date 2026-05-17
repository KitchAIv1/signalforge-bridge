import type { ReactNode } from 'react';
import { amdTagBadgeTextClass, amdTagBgColor, amdTagLabel } from '@/lib/amdPanelFormatters';

interface AmdIntelPrimaryTagProps {
  displayTag: string | null;
  manualOverrideSnippet: ReactNode;
}

export function AmdIntelPrimaryTag({ displayTag, manualOverrideSnippet }: AmdIntelPrimaryTagProps) {
  return (
    <div
      className={`rounded-lg px-3 py-2 text-sm font-semibold ${amdTagBgColor(displayTag)} ${amdTagBadgeTextClass(displayTag)}`}
    >
      {amdTagLabel(displayTag)}
      {manualOverrideSnippet}
    </div>
  );
}
