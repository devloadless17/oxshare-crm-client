import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Resource } from '@/hooks/use-resource';
import type { components } from '@/lib/api/types.gen';
import { VerificationStatus } from './verification-status';

type KycStatusDto = components['schemas']['KycStatusDto'];

/**
 * The profile's Verification panel names the IDENTITY check — reported: it read
 * the email flag, so every signed-in client (all of whom confirmed their email
 * to get in) was told "Your identity is verified." with no KYC at all.
 */

function resource(
  status: Resource<KycStatusDto | null>['status'],
  data?: Partial<KycStatusDto>,
): Resource<KycStatusDto | null> {
  return {
    status,
    data: data ? ({ status: 'not_started', ...data } as KycStatusDto) : undefined,
    isFetching: false,
    error: null,
    dataUpdatedAt: 0,
    refetch: () => Promise.resolve(),
  } as unknown as Resource<KycStatusDto | null>;
}

function renderWith(kyc: Resource<KycStatusDto | null>, verificationLevel = 0) {
  render(<VerificationStatus kyc={kyc} verificationLevel={verificationLevel} />);
  return screen.getByRole('status').textContent ?? '';
}

describe('the profile’s Verification panel', () => {
  it('does NOT call a client with no KYC verified — whatever their email says', () => {
    expect(renderWith(resource('ready', { status: 'not_started' }))).toMatch(/not complete/i);
    expect(screen.getByRole('link', { name: /continue verification/i })).toHaveAttribute(
      'href',
      '/kyc',
    );
  });

  it('claims nothing while the status is loading, or when it could not be read', () => {
    expect(renderWith(resource('loading'))).toMatch(/checking/i);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('says verified once approved, with nothing left to do', () => {
    expect(renderWith(resource('ready', { status: 'approved' }), 1)).toMatch(/is verified/i);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('says a submitted verification is being reviewed — and offers no form to redo', () => {
    expect(renderWith(resource('ready', { status: 'under_review' }))).toMatch(/being reviewed/i);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('asks a verified client the desk returned to UPDATE — never "rejected"', () => {
    const text = renderWith(
      resource('ready', { status: 'rejected', reverificationRequestedAt: '2026-09-26T10:00:00Z' }),
    );
    expect(text).toMatch(/needs an update/i);
    expect(text).not.toMatch(/reject|not approved/i);
    expect(screen.getByRole('link', { name: /update verification/i })).toBeInTheDocument();
  });

  it('tells a refused client to open it and correct what was returned', () => {
    expect(renderWith(resource('ready', { status: 'rejected' }))).toMatch(/needs attention/i);
  });
});
