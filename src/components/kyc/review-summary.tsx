'use client';

import Link from 'next/link';
import { CheckCircle2, FileText, User } from 'lucide-react';
import type { components } from '@/lib/api/types.gen';
import { t } from '@/lib/i18n';
import { answerText, docLabel, fieldLabel, stepTitle } from '@/lib/kyc-text';
import { isBarePhonePrefix } from './custom-step';

type KycStepConfig = components['schemas']['KycStepConfigDto'];
type KycFieldConfig = components['schemas']['KycFieldConfigDto'];
type KycStatus = components['schemas']['KycStatusDto'];
type StepState = components['schemas']['KycStepStateDto'];

interface Item {
  key: string;
  label: string;
  /** A typed answer; absent for an upload, which shows its state instead. */
  value?: string;
  /** An upload's state. */
  uploaded?: boolean;
  /** The server says this is still owed. */
  missing: boolean;
  /** The reviewer returned it, and it has not been answered. */
  returned: boolean;
}

/** Where each document step files the pages of the document chosen on it. */
const PAGE_SLOTS: Readonly<Record<string, readonly [string, string]>> = {
  document: ['doc_front', 'doc_back'],
  address: ['address_proof', 'address_proof_2'],
};

/**
 * The review screen: every configured step as the SERVER holds it, marked with
 * the server's own verdict.
 *
 * ## Why it reads the server, and only the server
 *
 * It was built from the form in this tab — the draft, the card last clicked,
 * the uploads this session saw — and judged completeness itself. So it could
 * list "Passport — Missing" beside a complete national ID on file (the draft
 * remembered a click), show a blank for an answer saved in an earlier session,
 * and call a step complete that `submit` then refused (reported from local
 * testing). The answers now come from `/kyc/status` and every mark from its
 * `steps` verdict (`kyc-step-state.ts`), the same judgement `submit` applies —
 * so what this screen says is what the button will find.
 *
 * Nothing here is sent anywhere. Every step saved its own answers; this screen
 * shows them and the button submits.
 */
export function ReviewSummary({
  title,
  description,
  steps,
  status,
}: {
  title: string;
  description?: string;
  steps: KycStepConfig[];
  status: KycStatus | null;
}) {
  const sections = steps
    .filter((step) => step.slug !== 'review' && step.enabled !== false)
    .map((step) => {
      const state = status?.steps?.find((candidate) => candidate.slug === step.slug);
      return { step, state, items: itemsOf(step, status, state) };
    })
    .filter((section) => section.items.length > 0);
  const owing = sections.filter((section) => section.state && !section.state.complete);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>

      {owing.length > 0 && (
        <div
          role="status"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2"
        >
          <p className="text-xs font-bold text-destructive">{t('kyc.reviewOwes')}</p>
          <ul className="space-y-1 text-xs text-foreground">
            {owing.map(({ step, state }) => (
              <li key={step.id}>
                <Link
                  href={`/kyc/step/${step.stepNumber}`}
                  className="font-semibold text-link underline-offset-2 hover:underline"
                >
                  {stepTitle(step)}
                </Link>
                {' — '}
                {owedLabels(state!).join(t('common.listSeparator'))}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        {sections.map(({ step, items }) => (
          <section
            key={step.id}
            className="rounded-2xl border border-border bg-card/60 p-5 space-y-3"
          >
            <div className="flex items-center gap-2 border-b border-border pb-3 text-link">
              {step.slug === 'personal' ? (
                <User className="h-4 w-4" aria-hidden="true" />
              ) : (
                <FileText className="h-4 w-4" aria-hidden="true" />
              )}
              <h3 className="text-xs font-bold uppercase tracking-wider">{stepTitle(step)}</h3>
            </div>
            <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 md:grid-cols-3">
              {items.map((item) => (
                <div key={item.key} className="min-w-0">
                  <dt className="text-muted-foreground text-[11px]">{item.label}</dt>
                  <dd
                    className={`font-semibold break-words ${
                      item.returned && !item.uploaded ? 'text-destructive' : 'text-foreground'
                    }`}
                  >
                    <ItemValue item={item} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}

function ItemValue({ item }: { item: Item }) {
  const flagged = item.returned
    ? t('kyc.documentReturned')
    : item.missing
      ? t('kyc.missing')
      : undefined;
  if (item.uploaded === undefined) {
    return item.missing ? (
      <span className="text-destructive">{t('kyc.missing')}</span>
    ) : (
      // The client's own answer, in its own direction (a phone stays `+961…`).
      <bdi>{item.value || '—'}</bdi>
    );
  }
  if (item.uploaded && !item.returned) {
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        {t('kyc.uploaded')}
      </span>
    );
  }
  return flagged ? <span className="text-destructive">{flagged}</span> : <>—</>;
}

/** What a step still owes, as the list above the sections names it. */
function owedLabels(state: StepState): string[] {
  return [
    ...state.missing.map((item) =>
      item.kind === 'choice'
        ? t('kyc.reviewChoose')
        : item.kind === 'invalid'
          ? (item.message ?? item.label)
          : item.label,
    ),
    ...state.returned
      .filter((item) => item.blocking)
      .map((item) => t('kyc.reviewReturned', { label: item.label })),
  ];
}

/** The rows one step contributes, in the order the step shows them. */
function itemsOf(
  step: KycStepConfig,
  status: KycStatus | null,
  state: StepState | undefined,
): Item[] {
  const missing = new Set(state?.missing.map((item) => item.id));
  const returned = new Set(state?.returned.map((item) => item.id));
  const items: Item[] = [];

  const slots = Object.prototype.hasOwnProperty.call(PAGE_SLOTS, step.slug)
    ? PAGE_SLOTS[step.slug]
    : undefined;
  if (slots) items.push(...documentItems(step, status, slots, missing, returned));

  if (step.slug === 'selfie') {
    items.push({
      key: 'selfie',
      label: (() => {
        const selfie = step.fields.find((field) => field.name === 'selfie');
        return selfie ? fieldLabel(selfie) : t('kyc.selfiePhoto');
      })(),
      uploaded: Boolean(status?.selfie?.filePath),
      missing: missing.has('selfie'),
      returned: returned.has('selfie'),
    });
  }

  const typed =
    (step.slug === 'personal' ? status?.personalInfo : status?.stepData?.[step.slug]) ?? {};
  const files = (status?.stepData?.[step.slug] ?? {}) as Record<string, unknown>;
  for (const field of step.fields) {
    if (field.document || (step.slug === 'selfie' && field.name === 'selfie')) continue;
    items.push(itemOf(field, typed, files, missing, returned));
  }
  return items;
}

/** The document on file and each of its pages — or the choice still to make. */
function documentItems(
  step: KycStepConfig,
  status: KycStatus | null,
  slots: readonly [string, string],
  missing: ReadonlySet<string>,
  returned: ReadonlySet<string>,
): Item[] {
  const identity = step.slug === 'document';
  const docType = identity ? status?.document?.docType : status?.addressProof?.docType;
  const files = identity
    ? [status?.document?.frontFilePath, status?.document?.backFilePath]
    : [status?.addressProof?.filePath, status?.addressProof?.page2FilePath];
  const field = step.fields.find((candidate) => candidate.document?.value === docType);

  if (!field?.document) {
    // Nothing chosen yet — or a document from before types were recorded.
    return [
      {
        key: `${step.slug}:choice`,
        label: stepTitle(step),
        uploaded: Boolean(files[0]),
        missing: missing.has('docType') || missing.has(slots[0]),
        returned: slots.some((slot) => returned.has(slot)),
      },
    ];
  }
  const parts = field.document.parts;
  return parts.flatMap((part, index) => {
    const slot = slots[index];
    if (!slot || (!part.required && !files[index])) return [];
    return [
      {
        key: slot,
        label: parts.length > 1 ? `${fieldLabel(field)} · ${docLabel(part)}` : fieldLabel(field),
        uploaded: Boolean(files[index]),
        missing: missing.has(slot),
        returned: returned.has(slot) || returned.has(field.name),
      },
    ];
  });
}

function itemOf(
  field: KycFieldConfig,
  typed: Record<string, unknown>,
  files: Record<string, unknown>,
  missing: ReadonlySet<string>,
  returned: ReadonlySet<string>,
): Item {
  const base = {
    key: field.name,
    label: fieldLabel(field),
    missing: missing.has(field.name),
    returned: returned.has(field.name),
  };
  if (field.type === 'file' || field.type === 'camera') {
    const file = files[field.name];
    return { ...base, uploaded: typeof file === 'object' && file !== null && 'filePath' in file };
  }
  const answer = typed[field.name];
  const raw =
    typeof answer === 'string'
      ? answer.trim()
      : typeof answer === 'number' || typeof answer === 'boolean'
        ? String(answer)
        : '';
  const value =
    field.type === 'checkbox' && !field.options?.length
      ? raw === 'true'
        ? t('kyc.answerYes')
        : raw === 'false'
          ? t('kyc.answerNo')
          : ''
      : field.type === 'phone' && isBarePhonePrefix(raw)
        ? ''
        : // A choice reads in the reader's language; the stored value is unchanged.
          answerText(field, raw);
  return { ...base, value };
}
