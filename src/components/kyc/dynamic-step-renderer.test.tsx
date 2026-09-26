import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { components } from '@/lib/api/types.gen';
import { documentChoiceKey } from './doc-type';
import { DynamicStepRenderer } from './dynamic-step-renderer';

type KycStepConfig = components['schemas']['KycStepConfigDto'];

/**
 * One identity document is kept (26 Sep 2026). Choosing another than the one on
 * file changes nothing yet — the server replaces the stored document when the
 * first page of the new one arrives — so the client is told THEN, under the
 * cards, before they upload: never a surprise, never a confirm on a harmless click.
 */

const doc = (value: string, label: string, parts: string[]) => ({
  id: `f-${value}`,
  name: `doc_${value}`,
  label,
  type: `doc:${value}`,
  required: false,
  document: {
    value,
    label,
    category: 'identity',
    parts: parts.map((part, index) => ({ key: `p${index}`, label: part, required: true })),
  },
});

const STEP = {
  id: 's-document',
  slug: 'document',
  title: 'Identity Document',
  description: 'One document that proves who you are.',
  stepNumber: 2,
  enabled: true,
  fields: [
    doc('national_id', 'National ID', ['Front Side', 'Back Side']),
    doc('passport', 'Passport', ['Photo page']),
  ],
} as unknown as KycStepConfig;

function renderStep(props: {
  chosen: string;
  storedType?: string;
  storedFiles?: Record<string, string>;
}) {
  render(
    <DynamicStepRenderer
      currentStepConfig={STEP}
      allSteps={[STEP]}
      formData={{ [documentChoiceKey('document')]: props.chosen }}
      uploadsState={{}}
      selfieUploaded={false}
      storedFiles={props.storedFiles ?? {}}
      storedDocValues={{ identity: props.storedType }}
      onChange={vi.fn()}
      onUpload={vi.fn()}
    />,
  );
}

describe('choosing another identity document than the one on file', () => {
  it('says the new one REPLACES the one sent — before anything is uploaded', () => {
    renderStep({
      chosen: 'doc_passport',
      storedType: 'national_id',
      storedFiles: { doc_front: '/uploads/kyc/front.png' },
    });
    expect(screen.getByRole('note')).toHaveTextContent(
      /already sent your National ID\. Uploading your Passport replaces it/i,
    );
  });

  it('says nothing for the document already on file', () => {
    renderStep({
      chosen: 'doc_national_id',
      storedType: 'national_id',
      storedFiles: { doc_front: '/uploads/kyc/front.png' },
    });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('says nothing when only a CHOICE was saved — there is nothing to replace', () => {
    renderStep({ chosen: 'doc_passport', storedType: 'national_id' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
