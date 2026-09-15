/**
 * Client-side upload ceilings, each mirroring the server that enforces it.
 *
 * Stated per surface rather than shared, because they are different routes with
 * their own limits — and the only safe direction is for the client's number to
 * be the same or smaller. A client limit that is LARGER merely moves the refusal
 * to the server, after the whole file has been uploaded.
 */

/** Mirrors `MAX_UPLOAD_BYTES` in the backend's `modules/compliance/upload-limits.ts`. */
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;
