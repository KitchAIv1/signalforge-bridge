/** Live Omega ratchet pip targets — shared by split + tp2 floor monitor. */

export const OMEGA_T1_PIPS = 4;
export const OMEGA_T2_PIPS = 6;

export function omegaPipSize(instrument: string): number {
  return instrument.includes('JPY') ? 0.01 : 0.0001;
}
