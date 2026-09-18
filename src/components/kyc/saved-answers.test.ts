import { describe, expect, it } from 'vitest';
import { savedAnswersFor } from './saved-answers';
import type { components } from '@/lib/api/types.gen';

type KycStatus = components['schemas']['KycStatusDto'];
type KycStepConfig = components['schemas']['KycStepConfigDto'];

/**
 * What the wizard reseeds a half-filled step from.
 *
 * Steps are deliberately resumable, so leaving and coming back is the expected
 * path. A step that renders EMPTY on return costs a client retyping their own
 * answers — and on the last step, submitting a form they believed they had
 * already finished.
 */

const step = (over: Partial<KycStepConfig> & { slug: string; stepNumber: number }) =>
  ({ id: `s-${over.slug}`, title: over.slug, enabled: true, fields: [], ...over });

const STEPS = [
  step({ slug: 'personal', stepNumber: 1 }),
  step({ slug: 'compliance-questions', stepNumber: 2 }),
];

const status = (over: Partial<KycStatus>) =>
  ({ userId: 'u1', status: 'in_progress', ...over }) as KycStatus;

describe('seeding a step from what was already saved', () => {
  it('reads a canonical step from personalInfo', () => {
    const data = status({ personalInfo: { firstName: 'Ali' } });
    expect(savedAnswersFor(data, STEPS, 1)).toEqual({ firstName: 'Ali' });
  });

  /** The case the whole module exists for. */
  it('reads a CUSTOM step from its own slug in stepData', () => {
    const data = status({
      personalInfo: { firstName: 'Ali' },
      stepData: { 'compliance-questions': { sourceOfFunds: 'Salary' } },
    });
    expect(savedAnswersFor(data, STEPS, 2)).toMatchObject({ sourceOfFunds: 'Salary' });
  });

  it('does not leak one custom step’s answers into another', () => {
    const steps = [...STEPS, step({ slug: 'other', stepNumber: 3 })];
    const data = status({
      stepData: { 'compliance-questions': { note: 'compliance' }, other: { note: 'other' } },
    });
    expect(savedAnswersFor(data, steps, 2).note).toBe('compliance');
    expect(savedAnswersFor(data, steps, 3).note).toBe('other');
  });

  /**
   * `String(null)` is `"null"`, which would seed a field with the word null —
   * and on a required field, pass a non-empty check.
   */
  it('drops absent values rather than stringifying them', () => {
    const data = status({
      personalInfo: { firstName: 'Ali', middleName: null, suffix: undefined },
    });
    const seeded = savedAnswersFor(data, STEPS, 1);
    expect(seeded).toEqual({ firstName: 'Ali' });
    expect(Object.values(seeded)).not.toContain('null');
  });

  /** react-query hands back null before the first fetch resolves. */
  it.each([[null], [undefined]])('survives %s data without throwing', (data) => {
    expect(savedAnswersFor(data, STEPS, 2)).toEqual({});
  });

  it('falls back to position when no step declares that number', () => {
    const data = status({ stepData: { 'compliance-questions': { sourceOfFunds: 'Salary' } } });
    const unnumbered = [
      step({ slug: 'personal', stepNumber: 0 }),
      step({ slug: 'compliance-questions', stepNumber: 0 }),
    ];
    expect(savedAnswersFor(data, unnumbered, 2)).toMatchObject({ sourceOfFunds: 'Salary' });
  });
});
