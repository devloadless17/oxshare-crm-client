import type { components } from './types.gen';
import { apiClient } from './client';
import { keys } from '@/lib/query-keys';

export type KycStatusDto = components['schemas']['KycStatusDto'];
export type KycStepConfigDto = components['schemas']['KycStepConfigDto'];

/**
 * The ONE definition of each shared KYC read: its key and its fetcher together.
 *
 * Every screen that reads `/kyc/status` or `/kyc/config` shares one cache entry,
 * so whichever copy of the fetcher ran first decided how that entry behaved —
 * eleven inline copies, two of them without the AbortSignal. Readers that need a
 * narrower shape add `select`; none writes its own fetcher.
 */
export const kycStatusQuery = {
  queryKey: keys.kyc.status(),
  /** A 200 with a null body is the documented answer for a client who never started. */
  queryFn: async (signal?: AbortSignal): Promise<KycStatusDto | null> =>
    (await apiClient.get<KycStatusDto | null>('/kyc/status', { signal })).data ?? null,
} as const;

export const kycConfigQuery = {
  queryKey: keys.kyc.config(),
  queryFn: async (signal?: AbortSignal): Promise<KycStepConfigDto[]> =>
    (await apiClient.get<KycStepConfigDto[]>('/kyc/config', { signal })).data,
} as const;
