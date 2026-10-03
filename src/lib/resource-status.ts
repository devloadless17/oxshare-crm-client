import type { ResourceStatus } from '@/hooks/use-resource';

interface StatusLike {
  status: ResourceStatus;
  error: unknown;
}

/**
 * One boundary over SEVERAL reads: the first read that is not `ready` speaks
 * for the screen, with its own error.
 *
 * A money form drawn while one of its reads is still loading — or has failed —
 * renders that read as empty, and an empty list there is a statement: /deposit
 * said "Not opened yet" beside a wallet holding $700 while `GET /wallet` was in
 * flight, and /transfer offered no wallet at all when that read failed, with
 * nothing on screen saying anything had gone wrong.
 */
export function firstUnready(...reads: StatusLike[]): StatusLike {
  return reads.find((read) => read.status !== 'ready') ?? { status: 'ready', error: null };
}
