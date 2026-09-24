/**
 * Builds the browser URL for a stored KYC document path.
 *
 * Same contract as `buildKycDocUrl` in the admin app, which records why it is
 * not a naive re-prefix: the backend has stored these paths in several shapes
 * ("uploads/kyc/<file>", "./uploads/kyc/<file>", Windows backslashes, a bare
 * filename), and prefixing `uploads/kyc/` onto one that already had it produced
 * `/uploads/kyc/kyc/<file>` and broke every document.
 *
 * The URL is on the API's own origin because the read is authenticated by the
 * session cookie that host owns — `GET /uploads/kyc/:file` serves a client their
 * own documents and nobody else's.
 */
import { API_BASE_URL } from './env';

export function buildKycDocUrl(filePath?: string): string {
  if (!filePath) return '';
  const rel = filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  return rel.startsWith('uploads/')
    ? `${API_BASE_URL}/${rel}`
    : `${API_BASE_URL}/uploads/kyc/${rel}`;
}
