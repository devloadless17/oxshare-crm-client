import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

/**
 * A request that never got an answer — the connection dropped, the device went
 * offline, the API was restarting — as opposed to one the server refused.
 *
 * Axios reports those with no `response` and the bare message "Network Error",
 * which `apiErrorMessage` passed straight through. Reported from production: a
 * client submitting their verification read "Network Error" and nothing else,
 * with no way to know whether it had been sent. A cancelled request (the page
 * moved on) is not one of these and must not be reported as a failure.
 */
export function isNetworkError(error: unknown): boolean {
  const e = error as { response?: unknown; code?: string; name?: string } | null;
  if (!e || typeof e !== 'object' || e.response) return false;
  if (e.code === 'ERR_CANCELED' || e.name === 'CanceledError') return false;
  return e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT';
}

/**
 * What to tell the client when a KYC request fails: the server's own words when
 * it answered, and a sentence a person can act on when it did not.
 */
export function kycErrorMessage(error: unknown): string {
  return isNetworkError(error)
    ? t('kyc.networkError')
    : apiErrorMessage(error, t('common.genericError'));
}
