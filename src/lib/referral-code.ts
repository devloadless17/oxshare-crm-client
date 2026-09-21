/**
 * Read a referral code the way the API will read it.
 *
 * The register page SHOWS the client the code it picked up from `?ref=`, and
 * sends that same value on. So if the two disagree about what the code is, the
 * client is shown something that looks accepted and silently is not.
 *
 * That happened. A client followed a partner's link and typed a backslash on
 * the end of the address; `?ref=ABCD2345\` was displayed back to them as their
 * referral code, the API could not resolve it, and the registration completed
 * with no partner attached. Nobody was told — an unattributed client looks
 * exactly like one who arrived on their own.
 *
 * ## The rule, and why it is not stricter
 *
 * Strip everything that is not a letter or a digit, then upper-case. A code is
 * alphanumeric; a backslash, a trailing slash, quotes from a chat app, a
 * hyphen or a zero-width character came from the transport.
 *
 * Deliberately NOT restricted to the alphabet codes are minted from
 * (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`, no O/0/I/1/L). That governs what the
 * backend GENERATES, not what is stored — seeded and imported partner rows
 * hold codes containing `L`, and stripping by the mint alphabet would break
 * their links entirely. Mirrors `common/referral-code.ts` in the backend; if
 * that rule changes, this changes with it.
 */
export function normaliseReferralCode(raw: string | null | undefined): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.length > 0 ? cleaned : undefined;
}
