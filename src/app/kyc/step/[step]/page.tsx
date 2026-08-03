'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';

import { DynamicStepRenderer, KycStepConfig } from '@/components/kyc/DynamicStepRenderer';

export default function KycStepPage() {
  const params = useParams();
  const router = useRouter();
  const stepNumber = Number(params.step) || 1;

  const [stepConfigs, setStepConfigs] = useState<KycStepConfig[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [docType, setDocType] = useState('passport');
  const [addressDocType, setAddressDocType] = useState('utility_bill');
  const [uploadsState, setUploadsState] = useState<Record<string, boolean>>({});
  const [selfieUploaded, setSelfieUploaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingInitialData, setFetchingInitialData] = useState(true);
  const [error, setError] = useState('');
  const [kycStatus, setKycStatus] = useState<string>('not_started');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [rejectedFields, setRejectedFields] = useState<string[]>([]);
  // A failed load is fatal for this page, so it gets its own state rather than
  // sharing `error`, which reports per-action (upload/save) failures.
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const set = (k: string, v: string) => {
    setFormData((p) => {
      const updated = { ...p, [k]: v };
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('oxshare_kyc_personal', JSON.stringify(updated));
      }
      return updated;
    });
  };

  // ── Restore saved state and fetch active steps from backend ────────────────
  //
  // The sessionStorage reads below are a deliberate exception to
  // react-hooks/set-state-in-effect. This IS the case the rule's own docs
  // allow — synchronising React state with an external system on mount — and
  // the alternatives are both worse: a lazy useState initialiser would read
  // sessionStorage during render, which the server cannot do, producing a
  // hydration mismatch on a form the user has half-filled.
  useEffect(() => {
    let initialPersonal: Record<string, string> = {};
    let initialUploads: Record<string, boolean> = {};

    if (typeof window !== 'undefined') {
      const cachedPersonal = sessionStorage.getItem('oxshare_kyc_personal');
      if (cachedPersonal) {
        try {
          initialPersonal = JSON.parse(cachedPersonal);
          // eslint-disable-next-line react-hooks/set-state-in-effect -- see note above
          setFormData(initialPersonal);
        } catch {
          // Corrupt sessionStorage is not worth surfacing: the form simply
          // starts empty, which is the same state as a first visit.
        }
      }

      const cachedUploads = sessionStorage.getItem('oxshare_kyc_uploads');
      if (cachedUploads) {
        try {
          initialUploads = JSON.parse(cachedUploads);
          setUploadsState(initialUploads);
          if (initialUploads['selfie']) setSelfieUploaded(true);
        } catch {
          // Corrupt sessionStorage is not worth surfacing: the form simply
          // starts empty, which is the same state as a first visit.
        }
      }
    }

    setFetchingInitialData(true);
    setLoadError('');

    // Neither request may be swallowed.
    //
    // These used to carry `.catch(() => ({ data: [] }))` and
    // `.catch(() => ({ data: null }))`. That turned a failed request into an
    // empty config, which renders this page as a verification form with no
    // fields and no error — the user is shown a broken onboarding step and told
    // nothing. Both responses are required for a correct render: without the
    // config there are no fields, and without the status we lose prefill and,
    // worse, the rejection notice on a returned KYC.
    Promise.all([api.get('/kyc/config'), api.get('/kyc/status')])
      .then(([configRes, statusRes]) => {
        if (configRes.data && Array.isArray(configRes.data)) {
          setStepConfigs(configRes.data);
        }

        const data = statusRes.data;
        const newUploads: Record<string, boolean> = { ...initialUploads };

        if (data?.status) setKycStatus(data.status);
        if (data?.rejectionReason) setRejectionReason(data.rejectionReason);
        if (data?.rejectedFields && Array.isArray(data.rejectedFields)) {
          setRejectedFields(data.rejectedFields);
        }

        if (data?.personalInfo) {
          const merged = { ...data.personalInfo, ...initialPersonal };
          setFormData(merged);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('oxshare_kyc_personal', JSON.stringify(merged));
          }
        }
        if (data?.document) {
          if (data.document.docType) setDocType(data.document.docType);
          if (data.document.frontFilePath) newUploads['doc_front'] = true;
          if (data.document.backFilePath) newUploads['doc_back'] = true;
        }
        if (data?.selfie?.filePath) {
          setSelfieUploaded(true);
          newUploads['selfie'] = true;
        }
        if (data?.addressProof) {
          if (data.addressProof.docType) setAddressDocType(data.addressProof.docType);
          if (data.addressProof.filePath) newUploads['address_proof'] = true;
          if (data.addressProof.page2FilePath) newUploads['address_proof_2'] = true;
        }

        setUploadsState(newUploads);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('oxshare_kyc_uploads', JSON.stringify(newUploads));
        }
      })
      .catch((err: unknown) => {
        setLoadError(
          apiErrorMessage(err, 'Could not load your verification details. Please try again.'),
        );
      })
      .finally(() => {
        setFetchingInitialData(false);
      });
  }, [reloadKey]);

  /* Upload handler */
  const handleUpload = useCallback(async (field: string, file: File) => {
    setError('');
    const form = new FormData();
    form.append('file', file);
    form.append('field', field);
    await api.post('/kyc/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });

    setUploadsState((p) => {
      const updated = { ...p, [field]: true };
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('oxshare_kyc_uploads', JSON.stringify(updated));
      }
      return updated;
    });

    if (field === 'selfie') setSelfieUploaded(true);
  }, []);

  const currentStepConfig =
    stepConfigs.find((s) => s.stepNumber === stepNumber) || stepConfigs[stepNumber - 1];

  const totalSteps = stepConfigs.length || 5;

  /* Save step data and advance */
  const handleNext = async () => {
    setError('');
    setLoading(true);
    try {
      const slug = currentStepConfig?.slug || 'personal';

      if (slug === 'personal') {
        if (
          !formData.firstName ||
          !formData.lastName ||
          !formData.dateOfBirth ||
          !formData.nationality ||
          !formData.country ||
          !formData.phone
        ) {
          setError('Please fill in all required fields.');
          setLoading(false);
          return;
        }
        const dob = new Date(formData.dateOfBirth);
        const minAgeDate = new Date();
        minAgeDate.setFullYear(minAgeDate.getFullYear() - 18);
        if (dob > minAgeDate) {
          setError('You must be at least 18 years old to register and complete KYC.');
          setLoading(false);
          return;
        }
        await api.post('/kyc/step', { step: 'personal', data: formData });
      } else if (slug === 'document') {
        if (!uploadsState['doc_front']) {
          setError('Please upload the front of your document.');
          setLoading(false);
          return;
        }
        if (docType !== 'passport' && !uploadsState['doc_back']) {
          const docName = docType === 'national_id' ? 'National ID' : 'Driving License';
          setError(`Please upload the back side of your ${docName}.`);
          setLoading(false);
          return;
        }
        await api.post('/kyc/step', { step: 'document', data: { docType } });
      } else if (slug === 'selfie') {
        if (!selfieUploaded) {
          setError('Please take or upload your selfie.');
          setLoading(false);
          return;
        }
        await api.post('/kyc/step', { step: 'selfie', data: {} });
      } else if (slug === 'address') {
        if (!uploadsState['address_proof']) {
          setError('Please upload your proof of address.');
          setLoading(false);
          return;
        }
        await api.post('/kyc/step', { step: 'address', data: { docType: addressDocType } });
      } else if (slug === 'review') {
        if (formData.firstName || formData.lastName) {
          await api.post('/kyc/step', { step: 'personal', data: formData });
        }
        await api.post('/kyc/submit');
        router.push('/kyc/submitted');
        return;
      }

      if (stepNumber < totalSteps) {
        router.push(`/kyc/step/${stepNumber + 1}`);
      } else {
        if (formData.firstName || formData.lastName) {
          await api.post('/kyc/step', { step: 'personal', data: formData });
        }
        await api.post('/kyc/submit');
        router.push('/kyc/submitted');
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Fail loudly. Rendering the form with `stepConfigs` empty would show the user
  // an onboarding step with no fields and no explanation.
  if (loadError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center min-h-[45vh] p-6 text-center space-y-4"
      >
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 shadow-sm">
          <AlertCircle className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">
            Could not load your verification details
          </p>
          <p className="text-xs text-muted-foreground max-w-sm">{loadError}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
          Try again
        </Button>
      </div>
    );
  }

  if (fetchingInitialData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[45vh] p-6 text-center space-y-4">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-link border border-primary/20 shadow-sm">
          <Loader2 className="h-7 w-7 animate-spin text-link" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">Loading Verification Details...</p>
          <p className="text-xs text-muted-foreground">
            Restoring your step progress and form data
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Rejection Notice Banner */}
      {kycStatus === 'rejected' && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs space-y-1.5 animate-in fade-in-0">
          <div className="flex items-center gap-2 font-bold text-destructive text-sm">
            <span>⚠️ Action Required: KYC Returned for Correction</span>
          </div>
          {rejectionReason && (
            <p className="text-destructive text-xs">
              <strong className="font-semibold text-destructive">Admin Rejection Note:</strong>{' '}
              {rejectionReason}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground pt-1">
            Please update the highlighted fields below with valid information and click continue.
            Your existing data remains saved.
          </p>
        </div>
      )}

      {/* Dynamic Step Component Renderer */}
      <DynamicStepRenderer
        currentStepConfig={currentStepConfig}
        formData={formData}
        docType={docType}
        addressDocType={addressDocType}
        uploadsState={uploadsState}
        selfieUploaded={selfieUploaded}
        rejectedFields={rejectedFields}
        onDocTypeChange={setDocType}
        onAddressDocTypeChange={setAddressDocType}
        onChange={set}
        onUpload={handleUpload}
      />

      {/* Global Error Banner */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-semibold text-destructive animate-in fade-in-0">
          {error}
        </div>
      )}

      {/* Navigation Footer Controls */}
      <div className="flex items-center justify-between pt-6 border-t border-border">
        {stepNumber > 1 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/kyc/step/${stepNumber - 1}`)}
            disabled={loading}
          >
            Back
          </Button>
        ) : (
          <div />
        )}

        <Button
          type="button"
          onClick={() => void handleNext()}
          disabled={loading}
          className="font-bold px-6 cursor-pointer"
        >
          {loading
            ? 'Processing...'
            : stepNumber === totalSteps || currentStepConfig?.slug === 'review'
              ? 'Submit Verification'
              : 'Continue'}
        </Button>
      </div>
    </div>
  );
}
