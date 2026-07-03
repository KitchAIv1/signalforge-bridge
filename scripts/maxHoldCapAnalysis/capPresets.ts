/** Max-hold cap presets in minutes (M5 bars = minutes / 5). */

export interface CapPreset {
  label: string;
  minutes: number;
  bars: number;
}

export const CAP_PRESETS: CapPreset[] = [
  { label: '60m', minutes: 60, bars: 12 },
  { label: '90m', minutes: 90, bars: 18 },
  { label: '120m', minutes: 120, bars: 24 },
  { label: '150m', minutes: 150, bars: 30 },
  { label: '180m', minutes: 180, bars: 36 },
  { label: '240m', minutes: 240, bars: 48 },
  { label: '300m', minutes: 300, bars: 60 },
  { label: '360m', minutes: 360, bars: 72 },
];

export function barsForMinutes(minutes: number): number {
  return Math.round(minutes / 5);
}
