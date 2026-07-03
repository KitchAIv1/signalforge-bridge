/** Mirror structure stop at fill — same formula as omegaTrailV1Execution. */

export function mirrorStructureStop(
  fillPrice: number,
  signalEntry: number,
  signalStopLoss: number,
  direction: 'long' | 'short',
): number {
  const signalRSize = Math.abs(signalEntry - signalStopLoss);
  return direction === 'short' ? fillPrice + signalRSize : fillPrice - signalRSize;
}
