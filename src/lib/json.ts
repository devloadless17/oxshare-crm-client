/**
 * `JSON.parse` that does not hand back `any`.
 *
 * The built-in returns `any`, so every read off a parsed value is unchecked —
 * which is how `initialUploads['selfie']` and a half-restored KYC form were
 * typed as "trust me". Callers get `unknown` and must narrow, or use one of the
 * record helpers below.
 */
export function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** A parsed object with string values, e.g. a restored text-input form. */
export function parseStringRecord(raw: string | null): Record<string, string> {
  if (!raw) return {};
  const parsed = parseJson(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
}

/** A parsed object with boolean values, e.g. which uploads have completed. */
export function parseBooleanRecord(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  const parsed = parseJson(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, Boolean(v)]));
}
