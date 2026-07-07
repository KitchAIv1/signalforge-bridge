export async function parseOverrideApiError(res: Response, label: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // ignore JSON parse failure
  }
  return `${label} failed: HTTP ${res.status}`;
}
