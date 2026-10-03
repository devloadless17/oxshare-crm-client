import { apiErrorDetail } from '@/lib/api/errors';

/**
 * The API envelope's technical `detail`, under a form's error message.
 *
 * The message is the sentence a person reads (and is in their language); the
 * detail is what support asks for — so it is small, muted, left to right and
 * selectable, and absent whenever the API sent none.
 *
 * ── How a form gets it without holding more state ──────────────────────────
 *
 * The forms keep their error as a STRING (`setError(apiErrorMessage(err, …))`).
 * `withErrorDetail(err, message)` wraps that call: it returns the message
 * unchanged and remembers the error's detail AGAINST THAT MESSAGE, so the
 * component that prints the message can ask `errorDetailFor(message)`. A
 * message the form wrote itself (a missing amount) was never remembered and so
 * never shows a detail; a later failure with the same message and no detail
 * forgets the old one.
 */
const remembered = new Map<string, string>();

export function withErrorDetail(error: unknown, message: string): string {
  const detail = apiErrorDetail(error);
  if (detail) remembered.set(message, detail);
  else remembered.delete(message);
  return message;
}

export function errorDetailFor(message: string | null | undefined): string | undefined {
  return message ? remembered.get(message) : undefined;
}

export function ErrorDetail({ detail }: { detail: string | undefined }) {
  if (!detail) return null;
  return (
    <span
      dir="ltr"
      className="mt-1 block font-mono text-[11px] font-normal break-words opacity-75 select-all"
    >
      {detail}
    </span>
  );
}
