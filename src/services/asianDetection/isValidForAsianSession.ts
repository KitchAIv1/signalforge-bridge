export function isValidForAsianSession(
  validUntil: string | null,
  tradeDate: string,
): boolean {
  if (!validUntil) return false;
  const expiry = new Date(validUntil);
  const now = new Date();
  const expiryDateUtc = expiry.toISOString().slice(0, 10);
  const expiryHourUtc = expiry.getUTCHours();
  return expiryDateUtc === tradeDate && expiryHourUtc === 8 && expiry.getTime() > now.getTime();
}
