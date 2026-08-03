// TWIN FILE — an identical copy lives at the same path in oxshare-crm-admin.
// Behaviour changes belong in BOTH. Anything app-specific (cookie names,
// token lifetimes, redirect paths, endpoint patterns) goes in the config block
// at the top of the file, never inline — that is what keeps a diff between the
// two copies a signal rather than noise.

/**
 * Message from an API error, falling back to a caller-supplied default.
 *
 * Six auth pages each had this same `catch (err: any)` block inline, reaching
 * through `err.response.data.message` with no type at all. `any` there is not a
 * shortcut — it silences the compiler on the one value in the function whose
 * shape is genuinely unknown.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: { message?: string | string[] } } })?.response;
  const message = response?.data?.message ?? (error as { message?: string })?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}
