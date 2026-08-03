/** Policy flag sets for toxic-crack CF (reuse refuse-tape mesh). */

import type { PolicyFlags } from '../aoRefuseTapeCf/applyPolicies.js';

const OFF = {
  normalizeSizeToHardStop10: false,
  sizeCutShallowRefuseToHardStop10: false,
  conditionalBrakeAfter2Losers: false,
  skipShallowRefuseEntries: false,
  halfSizeShallowRefuseEntries: false,
  noFollowThroughAbort: false,
} as const;

function policy(label: string, flags: Omit<PolicyFlags, 'label'>): PolicyFlags {
  return { label, ...flags };
}

/** Focused set: skip / brake / abort alone + Policy I mesh (v1 ships skip only). */
export const TOXIC_CRACK_POLICIES: PolicyFlags[] = [
  policy('A) baseline (actual live)', { ...OFF }),
  policy('D) shallow+refuse skip only', { ...OFF, skipShallowRefuseEntries: true }),
  policy('C) conditional brake only', { ...OFF, conditionalBrakeAfter2Losers: true }),
  policy('E) NFT abort only', { ...OFF, noFollowThroughAbort: true }),
  policy('I) MESH primary: brake + skip + abort (no global HS10)', {
    ...OFF,
    conditionalBrakeAfter2Losers: true,
    skipShallowRefuseEntries: true,
    noFollowThroughAbort: true,
  }),
];

export const POLICY_I_FLAGS: PolicyFlags = TOXIC_CRACK_POLICIES.find((row) =>
  row.label.startsWith('I)'),
)!;
