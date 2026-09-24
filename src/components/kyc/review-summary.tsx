'use client';

import { CheckCircle2, FileText, User } from 'lucide-react';
import type { components } from '@/lib/api/types.gen';
import { t } from '@/lib/i18n';
import { documentChoiceKey, isUploadField, uploadFieldFor } from './doc-type';
import { isBarePhonePrefix } from './custom-step';

type KycStepConfig = components['schemas']['KycStepConfigDto'];
type KycFieldConfig = components['schemas']['KycFieldConfigDto'];

interface Item {
  key: string;
  label: string;
  /** A typed answer; absent for an upload, which shows its state instead. */
  value?: string;
  /** An upload's state. */
  uploaded?: boolean;
  returned: boolean;
}

/**
 * The review screen: every configured step, as the client answered it.
 *
 * ## Built from the CONFIGURATION, like the steps themselves
 *
 * It was three hard-coded rows — ID document, selfie, proof of address — so a
 * broker who disabled the address step left every client looking at "Proof of
 * address: Missing" in red on the last screen, with no step to go back to; and
 * a custom step's answers were not on it at all, so the client was asked to
 * confirm details the screen did not show them.
 *
 * Nothing here is sent anywhere. Every step saved its own answers when the
 * client pressed Continue; this screen shows them and the button submits.
 */
export function ReviewSummary({
  title,
  description,
  steps,
  formData,
  uploadsState,
  selfieUploaded,
  rejectedFields,
}: {
  title: string;
  description?: string;
  steps: KycStepConfig[];
  formData: Record<string, string>;
  uploadsState: Record<string, boolean>;
  selfieUploaded: boolean;
  rejectedFields: string[];
}) {
  const sections = steps
    .filter((step) => step.slug !== 'review' && step.enabled !== false)
    .map((step) => ({
      step,
      items: itemsOf(step, formData, uploadsState, selfieUploaded, rejectedFields),
    }))
    .filter((section) => section.items.length > 0);

  const owesDocuments = sections.some((s) => s.items.some((i) => i.returned && !i.uploaded));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>

      {owesDocuments && (
        <p role="status" className="text-xs font-semibold text-destructive">
          {t('kyc.replaceReturned')}
        </p>
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
              <h3 className="text-xs font-bold uppercase tracking-wider">{step.title}</h3>
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
                    {item.uploaded === undefined ? (
                      item.value || '—'
                    ) : item.uploaded ? (
                      <span className="inline-flex items-center gap-1 text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('kyc.uploaded')}
                      </span>
                    ) : (
                      <span className="text-destructive">
                        {item.returned ? t('kyc.documentReturned') : t('kyc.missing')}
                      </span>
                    )}
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

/** The rows one step contributes, in the order the step asked for them. */
function itemsOf(
  step: KycStepConfig,
  formData: Record<string, string>,
  uploadsState: Record<string, boolean>,
  selfieUploaded: boolean,
  rejectedFields: string[],
): Item[] {
  if (step.slug === 'selfie') {
    const label = step.fields[0]?.label ?? t('kyc.selfiePhoto');
    return [
      {
        key: 'selfie',
        label,
        uploaded: selfieUploaded,
        returned: rejectedFields.includes('selfie'),
      },
    ];
  }

  const items: Item[] = [];
  const documents = step.fields.filter((f) => f.document);
  if (documents.length > 0) {
    const chosen = documents.find((f) => f.name === formData[documentChoiceKey(step.slug)]);
    if (!chosen) {
      items.push({
        key: `${step.slug}:choice`,
        label: step.title,
        uploaded: false,
        returned: false,
      });
    } else {
      (chosen.document?.parts ?? []).forEach((part, index) => {
        const slot = uploadFieldFor(step.slug, chosen.name, index, chosen.document?.category);
        if (!slot || (!part.required && !uploadsState[slot])) return;
        items.push({
          key: slot,
          label:
            (chosen.document?.parts.length ?? 0) > 1
              ? `${chosen.label} · ${part.label}`
              : chosen.label,
          uploaded: Boolean(uploadsState[slot]),
          returned: rejectedFields.includes(slot) || rejectedFields.includes(chosen.name),
        });
      });
    }
  }

  for (const field of step.fields.filter((f) => !f.document))
    items.push(itemOf(field, formData, uploadsState, rejectedFields));
  return items;
}

function itemOf(
  field: KycFieldConfig,
  formData: Record<string, string>,
  uploadsState: Record<string, boolean>,
  rejectedFields: string[],
): Item {
  const returned = rejectedFields.includes(field.name);
  if (isUploadField(field)) {
    return {
      key: field.name,
      label: field.label,
      uploaded: Boolean(uploadsState[field.name]),
      returned,
    };
  }
  const raw = (formData[field.name] ?? '').trim();
  const value =
    field.type === 'checkbox'
      ? raw === 'true'
        ? t('kyc.answerYes')
        : raw === 'false'
          ? t('kyc.answerNo')
          : ''
      : field.type === 'phone' && isBarePhonePrefix(raw)
        ? ''
        : raw;
  return { key: field.name, label: field.label, value, returned };
}
