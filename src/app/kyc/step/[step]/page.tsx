'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';

/* ─── Types ─────────────────────────────────────────────────────────────── */
type StepData = {
  personal: Record<string, string>;
  document: { docType: string };
  selfie: null;
  address: { docType: string };
};

const COUNTRIES = ['Lebanon','United Arab Emirates','Saudi Arabia','Kuwait','Qatar','Bahrain','Oman','Jordan','Egypt','United States','United Kingdom','France','Germany','Canada','Australia','Other'];
const NATIONALITIES = ['Lebanese','Emirati','Saudi','Kuwaiti','Qatari','Bahraini','Omani','Jordanian','Egyptian','American','British','French','German','Canadian','Australian','Other'];
const DOC_TYPES = [
  { value: 'passport', label: 'Passport', icon: '🛂' },
  { value: 'national_id', label: 'National ID', icon: '🪪' },
  { value: 'driving_license', label: 'Driving License', icon: '🚗' },
];
const ADDRESS_DOC_TYPES = [
  { value: 'utility_bill', label: 'Utility Bill', icon: '⚡' },
  { value: 'bank_statement', label: 'Bank Statement', icon: '🏦' },
  { value: 'tenancy_agreement', label: 'Tenancy Agreement', icon: '🏠' },
];

/* ─── File Upload Zone ───────────────────────────────────────────────────── */
function FileUploadZone({
  label, field, accept = 'image/*,.pdf',
  hint, uploaded, onUpload,
}: {
  label: string; field: string; accept?: string;
  hint?: string; uploaded?: string;
  onUpload: (field: string, file: File) => Promise<void>;
}) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    setLoading(true);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview('pdf');
    }
    await onUpload(field, file);
    setLoading(false);
  }, [field, onUpload]);

  return (
    <div
      className={`upload-zone ${dragging ? 'drag-over' : ''} ${preview || uploaded ? 'has-file' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      {loading ? (
        <div className="upload-content">
          <div className="upload-spinner" />
          <p>Uploading...</p>
        </div>
      ) : (preview || uploaded) ? (
        <div className="upload-content">
          {preview && preview !== 'pdf' ? (
            <img src={preview} alt={label} className="upload-preview-img" />
          ) : (
            <div className="upload-pdf-icon">📄</div>
          )}
          <p className="upload-success">✓ {label} uploaded</p>
          <span className="upload-change">Click to change</span>
        </div>
      ) : (
        <div className="upload-content">
          <div className="upload-icon">📁</div>
          <p className="upload-label">{label}</p>
          <p className="upload-hint">{hint || 'Drag & drop or click to browse'}</p>
          <p className="upload-formats">JPG, PNG, PDF · max 10MB</p>
        </div>
      )}
    </div>
  );
}

/* ─── Selfie Capture ─────────────────────────────────────────────────────── */
function SelfieCapturer({ onUpload }: { onUpload: (field: string, file: File) => Promise<void> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cameraError, setCameraError] = useState(false);

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setStream(s);
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch {
      setCameraError(true);
    }
  };

  const stopCamera = () => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    setCaptured(canvas.toDataURL('image/jpeg'));
    stopCamera();
  };

  const uploadCaptured = async () => {
    if (!captured) return;
    setUploading(true);
    const res = await fetch(captured);
    const blob = await res.blob();
    const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
    await onUpload('selfie', file);
    setUploading(false);
  };

  useEffect(() => () => stopCamera(), []);

  return (
    <div className="selfie-wrap">
      {!stream && !captured && (
        <div className="selfie-instructions">
          <div className="selfie-guide-icon">🤳</div>
          <h4>Take a selfie</h4>
          <ul className="selfie-tips">
            <li>✓ Face must be clearly visible</li>
            <li>✓ Good lighting, no sunglasses</li>
            <li>✓ Hold your ID next to your face</li>
            <li>✓ Plain background preferred</li>
          </ul>
          <div className="selfie-btns">
            <button className="btn-primary" onClick={startCamera} disabled={cameraError}>
              {cameraError ? '📷 Camera unavailable' : '📷 Open Camera'}
            </button>
            <span className="selfie-or">or</span>
            <FileUploadZone label="Upload Selfie" field="selfie" accept="image/*" hint="Upload a selfie photo" onUpload={onUpload} />
          </div>
        </div>
      )}

      {stream && (
        <div className="camera-wrap">
          <div className="camera-frame">
            <video ref={videoRef} autoPlay playsInline className="camera-video" />
            <div className="camera-overlay" />
          </div>
          <button className="btn-capture" onClick={capture}>📸 Capture</button>
        </div>
      )}

      {captured && (
        <div className="captured-wrap">
          <img src={captured} alt="selfie" className="captured-img" />
          <div className="captured-btns">
            <button className="btn-secondary" onClick={() => { setCaptured(null); }}>Retake</button>
            <button className="btn-primary" onClick={uploadCaptured} disabled={uploading}>
              {uploading ? 'Uploading...' : '✓ Use this photo'}
            </button>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden-canvas" />
    </div>
  );
}

/* ─── Main Step Page ─────────────────────────────────────────────────────── */
export default function KycStepPage() {
  const params = useParams();
  const router = useRouter();
  const step = Number(params.step);

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [docType, setDocType] = useState('passport');
  const [addressDocType, setAddressDocType] = useState('utility_bill');
  const [uploadsState, setUploadsState] = useState<Record<string, boolean>>({});
  const [selfieUploaded, setSelfieUploaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setFormData((p) => ({ ...p, [k]: v }));

  /* Upload handler */
  const handleUpload = useCallback(async (field: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('field', field);
    await api.post('/kyc/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    setUploadsState((p) => ({ ...p, [field]: true }));
    if (field === 'selfie') setSelfieUploaded(true);
  }, []);

  /* Save step data and advance */
  const handleNext = async () => {
    setError('');
    setLoading(true);
    try {
      if (step === 1) {
        if (!formData.firstName || !formData.lastName || !formData.dateOfBirth || !formData.nationality || !formData.country || !formData.phone) {
          setError('Please fill in all required fields.'); setLoading(false); return;
        }
        await api.post('/kyc/step', { step: 'personal', data: formData });
      } else if (step === 2) {
        if (!uploadsState['doc_front']) { setError('Please upload the front of your document.'); setLoading(false); return; }
        await api.post('/kyc/step', { step: 'document', data: { docType } });
      } else if (step === 3) {
        if (!selfieUploaded) { setError('Please take or upload your selfie.'); setLoading(false); return; }
        await api.post('/kyc/step', { step: 'selfie', data: {} });
      } else if (step === 4) {
        if (!uploadsState['address_proof']) { setError('Please upload your proof of address.'); setLoading(false); return; }
        await api.post('/kyc/step', { step: 'address', data: { docType: addressDocType } });
      } else if (step === 5) {
        await api.post('/kyc/submit');
        router.push('/kyc/submitted');
        return;
      }

      if (step < 5) router.push(`/kyc/step/${step + 1}`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kyc-step-wrap">
      {/* ── Step 1: Personal Info ───────────────────────────────── */}
      {step === 1 && (
        <>
          <div className="step-header">
            <h2>Personal Information</h2>
            <p>Please provide your legal name and details exactly as they appear on your ID.</p>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>First Name <span className="req">*</span></label>
              <input className="form-input" placeholder="As on your ID" value={formData.firstName || ''} onChange={(e) => set('firstName', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Last Name <span className="req">*</span></label>
              <input className="form-input" placeholder="As on your ID" value={formData.lastName || ''} onChange={(e) => set('lastName', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Date of Birth <span className="req">*</span></label>
              <input type="date" className="form-input" value={formData.dateOfBirth || ''} onChange={(e) => set('dateOfBirth', e.target.value)} max={new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]} />
            </div>
            <div className="form-group">
              <label>Phone Number <span className="req">*</span></label>
              <input className="form-input" placeholder="+1 234 567 8900" value={formData.phone || ''} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Nationality <span className="req">*</span></label>
              <select className="form-input" value={formData.nationality || ''} onChange={(e) => set('nationality', e.target.value)}>
                <option value="">Select nationality</option>
                {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Country of Residence <span className="req">*</span></label>
              <select className="form-input" value={formData.country || ''} onChange={(e) => set('country', e.target.value)}>
                <option value="">Select country</option>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group full-width">
              <label>Residential Address</label>
              <input className="form-input" placeholder="Street, City, Country (optional)" value={formData.address || ''} onChange={(e) => set('address', e.target.value)} />
            </div>
          </div>
        </>
      )}

      {/* ── Step 2: Document ────────────────────────────────────── */}
      {step === 2 && (
        <>
          <div className="step-header">
            <h2>Identity Document</h2>
            <p>Upload a government-issued ID. Images must be clear, unobstructed, and in full colour.</p>
          </div>
          <div className="doc-type-grid">
            {DOC_TYPES.map((dt) => (
              <button key={dt.value} className={`doc-type-card ${docType === dt.value ? 'selected' : ''}`} onClick={() => setDocType(dt.value)}>
                <span className="doc-type-icon">{dt.icon}</span>
                <span>{dt.label}</span>
              </button>
            ))}
          </div>
          <div className="upload-grid">
            <FileUploadZone label="Front Side" field="doc_front" hint="Upload the front of your document" uploaded={uploadsState['doc_front'] ? 'yes' : undefined} onUpload={handleUpload} />
            <FileUploadZone label="Back Side" field="doc_back" hint="Upload the back (if applicable)" uploaded={uploadsState['doc_back'] ? 'yes' : undefined} onUpload={handleUpload} />
          </div>
          <div className="doc-tips">
            <h4>Requirements</h4>
            <ul>
              <li>✓ All 4 corners must be visible</li>
              <li>✓ No glare, reflections or blur</li>
              <li>✓ Document must not be expired</li>
              <li>✓ Colour photo — no black & white</li>
            </ul>
          </div>
        </>
      )}

      {/* ── Step 3: Selfie ──────────────────────────────────────── */}
      {step === 3 && (
        <>
          <div className="step-header">
            <h2>Selfie Verification</h2>
            <p>Take a live selfie to confirm your identity matches your document.</p>
          </div>
          <SelfieCapturer onUpload={handleUpload} />
        </>
      )}

      {/* ── Step 4: Address Proof ────────────────────────────────── */}
      {step === 4 && (
        <>
          <div className="step-header">
            <h2>Proof of Address</h2>
            <p>Please provide a document dated within the last 3 months showing your residential address.</p>
          </div>
          <div className="doc-type-grid">
            {ADDRESS_DOC_TYPES.map((dt) => (
              <button key={dt.value} className={`doc-type-card ${addressDocType === dt.value ? 'selected' : ''}`} onClick={() => setAddressDocType(dt.value)}>
                <span className="doc-type-icon">{dt.icon}</span>
                <span>{dt.label}</span>
              </button>
            ))}
          </div>
          <FileUploadZone label="Address Document" field="address_proof" hint="Upload your proof of address" uploaded={uploadsState['address_proof'] ? 'yes' : undefined} onUpload={handleUpload} />
          <div className="doc-tips">
            <h4>Requirements</h4>
            <ul>
              <li>✓ Dated within the last 3 months</li>
              <li>✓ Your full name and address must be visible</li>
              <li>✓ Official document — not hand-written</li>
            </ul>
          </div>
        </>
      )}

      {/* ── Step 5: Review ──────────────────────────────────────── */}
      {step === 5 && (
        <>
          <div className="step-header">
            <h2>Review & Submit</h2>
            <p>Please review the information you have provided before submitting for review.</p>
          </div>
          <div className="review-card">
            <div className="review-section">
              <div className="review-section-title">📋 Personal Information</div>
              <div className="review-row"><span>Name</span><strong>{formData.firstName} {formData.lastName}</strong></div>
              <div className="review-row"><span>Date of Birth</span><strong>{formData.dateOfBirth || '—'}</strong></div>
              <div className="review-row"><span>Nationality</span><strong>{formData.nationality || '—'}</strong></div>
              <div className="review-row"><span>Country</span><strong>{formData.country || '—'}</strong></div>
              <div className="review-row"><span>Phone</span><strong>{formData.phone || '—'}</strong></div>
            </div>
            <div className="review-section">
              <div className="review-section-title">🪪 Documents Submitted</div>
              <div className="review-row"><span>ID Type</span><strong>{docType.replace('_', ' ')}</strong></div>
              <div className="review-row"><span>ID Front</span><strong className={uploadsState['doc_front'] ? 'text-green' : 'text-red'}>{uploadsState['doc_front'] ? '✓ Uploaded' : '✗ Missing'}</strong></div>
              <div className="review-row"><span>ID Back</span><strong>{uploadsState['doc_back'] ? '✓ Uploaded' : '— (optional)'}</strong></div>
              <div className="review-row"><span>Selfie</span><strong className={selfieUploaded ? 'text-green' : 'text-red'}>{selfieUploaded ? '✓ Uploaded' : '✗ Missing'}</strong></div>
              <div className="review-row"><span>Address Proof</span><strong className={uploadsState['address_proof'] ? 'text-green' : 'text-red'}>{uploadsState['address_proof'] ? '✓ Uploaded' : '✗ Missing'}</strong></div>
            </div>
          </div>
          <div className="review-disclaimer">
            <p>By submitting, I confirm that all information provided is true, accurate and complete. I understand that providing false information may result in account suspension.</p>
          </div>
        </>
      )}

      {/* ── Error & Nav ──────────────────────────────────────────── */}
      {error && <div className="step-error">{error}</div>}

      <div className="step-nav">
        {step > 1 && (
          <button className="btn-secondary" onClick={() => router.push(`/kyc/step/${step - 1}`)}>
            ← Back
          </button>
        )}
        <button className="btn-primary btn-next" onClick={handleNext} disabled={loading}>
          {loading ? <span className="btn-spinner" /> : step === 5 ? '🚀 Submit for Review' : 'Continue →'}
        </button>
      </div>

      <style jsx>{`
        .kyc-step-wrap { animation: fadeSlide 0.35s ease both; }
        @keyframes fadeSlide { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }

        .step-header { margin-bottom: 32px; }
        .step-header h2 { font-size: 1.6rem; font-weight: 700; color: #e8eeff; margin-bottom: 8px; }
        .step-header p { color: #7c87b4; font-size: 0.93rem; line-height: 1.6; }

        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .form-group { display: flex; flex-direction: column; gap: 8px; }
        .full-width { grid-column: 1 / -1; }
        label { font-size: 0.82rem; font-weight: 500; color: #9ba8d4; letter-spacing: 0.02em; }
        .req { color: #f87171; }
        .form-input {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(99,130,255,0.2);
          border-radius: 10px;
          padding: 12px 16px;
          color: #e8eeff;
          font-size: 0.93rem;
          outline: none;
          transition: border-color 0.2s;
          width: 100%;
        }
        .form-input:focus { border-color: #6382ff; background: rgba(99,130,255,0.06); }
        .form-input option { background: #1a1f3d; color: #e8eeff; }

        .doc-type-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
        .doc-type-card {
          background: rgba(255,255,255,0.03);
          border: 2px solid rgba(99,130,255,0.15);
          border-radius: 14px;
          padding: 18px 12px;
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          color: #9ba8d4; font-size: 0.85rem; font-weight: 500;
          cursor: pointer; transition: all 0.2s;
        }
        .doc-type-card:hover { border-color: rgba(99,130,255,0.4); background: rgba(99,130,255,0.06); }
        .doc-type-card.selected {
          border-color: #6382ff;
          background: rgba(99,130,255,0.12);
          color: #a5b4fc;
        }
        .doc-type-icon { font-size: 1.6rem; }

        .upload-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .upload-zone {
          border: 2px dashed rgba(99,130,255,0.25);
          border-radius: 16px;
          padding: 32px 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          background: rgba(255,255,255,0.02);
          min-height: 160px;
          display: flex; align-items: center; justify-content: center;
        }
        .upload-zone:hover, .upload-zone.drag-over {
          border-color: #6382ff;
          background: rgba(99,130,255,0.07);
        }
        .upload-zone.has-file { border-style: solid; border-color: rgba(34,197,94,0.4); background: rgba(34,197,94,0.04); }
        .upload-content { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; }
        .upload-icon { font-size: 2rem; }
        .upload-label { font-size: 0.9rem; font-weight: 600; color: #c7d2fe; }
        .upload-hint { font-size: 0.78rem; color: #7c87b4; }
        .upload-formats { font-size: 0.72rem; color: #5a6280; }
        .upload-preview-img { width: 100%; max-height: 120px; object-fit: cover; border-radius: 8px; }
        .upload-pdf-icon { font-size: 2.5rem; }
        .upload-success { font-size: 0.85rem; color: #4ade80; font-weight: 600; }
        .upload-change { font-size: 0.72rem; color: #7c87b4; }
        .upload-spinner {
          width: 28px; height: 28px;
          border: 3px solid rgba(99,130,255,0.2);
          border-top-color: #6382ff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        .hidden-input { display: none; }

        /* Selfie */
        .selfie-wrap { display: flex; flex-direction: column; gap: 20px; }
        .selfie-instructions { text-align: center; padding: 20px; }
        .selfie-guide-icon { font-size: 3rem; margin-bottom: 12px; }
        .selfie-instructions h4 { font-size: 1.1rem; color: #e8eeff; margin-bottom: 16px; }
        .selfie-tips { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 6px; text-align: left; max-width: 280px; margin: 0 auto 24px; color: #9ba8d4; font-size: 0.85rem; }
        .selfie-btns { display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .selfie-or { color: #7c87b4; font-size: 0.82rem; }
        .camera-wrap { display: flex; flex-direction: column; align-items: center; gap: 20px; }
        .camera-frame { position: relative; border-radius: 16px; overflow: hidden; border: 2px solid rgba(99,130,255,0.3); max-width: 400px; width: 100%; }
        .camera-video { width: 100%; display: block; }
        .camera-overlay {
          position: absolute; inset: 0; pointer-events: none;
          border: 3px solid rgba(99,130,255,0.6);
          border-radius: 14px;
        }
        .btn-capture {
          background: linear-gradient(135deg, #6382ff, #a78bfa);
          color: white; border: none; border-radius: 50px; padding: 14px 32px;
          font-size: 1rem; font-weight: 600; cursor: pointer;
        }
        .captured-wrap { display: flex; flex-direction: column; align-items: center; gap: 16px; }
        .captured-img { max-width: 300px; border-radius: 16px; border: 2px solid rgba(99,130,255,0.3); }
        .captured-btns { display: flex; gap: 12px; }
        .hidden-canvas { display: none; }

        /* Address tips */
        .doc-tips { background: rgba(99,130,255,0.06); border: 1px solid rgba(99,130,255,0.15); border-radius: 12px; padding: 20px 24px; margin-top: 24px; }
        .doc-tips h4 { color: #a5b4fc; font-size: 0.85rem; margin-bottom: 12px; letter-spacing: 0.05em; text-transform: uppercase; }
        .doc-tips ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 8px; color: #9ba8d4; font-size: 0.85rem; }

        /* Review */
        .review-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(99,130,255,0.15); border-radius: 16px; overflow: hidden; margin-bottom: 20px; }
        .review-section { padding: 20px 24px; border-bottom: 1px solid rgba(99,130,255,0.1); }
        .review-section:last-child { border-bottom: none; }
        .review-section-title { font-size: 0.82rem; color: #7c87b4; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 16px; }
        .review-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 0.88rem; }
        .review-row:last-child { border-bottom: none; }
        .review-row span { color: #7c87b4; }
        .review-row strong { color: #c7d2fe; text-transform: capitalize; }
        .text-green { color: #4ade80 !important; }
        .text-red { color: #f87171 !important; }
        .review-disclaimer { background: rgba(251,191,36,0.05); border: 1px solid rgba(251,191,36,0.15); border-radius: 12px; padding: 16px 20px; font-size: 0.82rem; color: #9ba8d4; line-height: 1.6; }

        /* Nav */
        .step-error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); border-radius: 10px; padding: 12px 16px; color: #fca5a5; font-size: 0.85rem; margin: 20px 0 0; }
        .step-nav { display: flex; justify-content: flex-end; gap: 12px; margin-top: 32px; }
        .btn-primary {
          background: linear-gradient(135deg, #6382ff, #a78bfa);
          color: white; border: none; border-radius: 50px;
          padding: 14px 32px; font-size: 0.95rem; font-weight: 600;
          cursor: pointer; transition: all 0.2s;
          display: flex; align-items: center; gap: 8px;
        }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(99,130,255,0.35); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .btn-next { min-width: 160px; justify-content: center; }
        .btn-secondary {
          background: rgba(255,255,255,0.06); color: #9ba8d4;
          border: 1px solid rgba(99,130,255,0.2); border-radius: 50px;
          padding: 14px 28px; font-size: 0.95rem; cursor: pointer; transition: all 0.2s;
        }
        .btn-secondary:hover { background: rgba(255,255,255,0.1); color: #c7d2fe; }
        .btn-spinner {
          width: 18px; height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white; border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 600px) {
          .form-grid { grid-template-columns: 1fr; }
          .doc-type-grid { grid-template-columns: 1fr; }
          .upload-grid { grid-template-columns: 1fr; }
          .step-nav { flex-direction: column; }
          .btn-primary, .btn-secondary { width: 100%; justify-content: center; }
        }
      `}</style>
    </div>
  );
}
