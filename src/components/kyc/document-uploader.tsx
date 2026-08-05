'use client';

import * as React from 'react';
import {
  UploadCloud,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Camera,
  FolderOpen,
} from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

export interface DocumentUploaderProps {
  label: string;
  field: string;
  accept?: string;
  hint?: string;
  uploaded?: boolean;
  onUpload: (field: string, file: File, onProgress?: (percent: number) => void) => Promise<void>;
  className?: string;
  /** The admin rejected this specific field — show it, don't just track it. */
  isErrored?: boolean;
  /**
   * Which camera to open when the client chooses "Take photo".
   * `environment` (rear) for documents, `user` (front) for a face.
   */
  capture?: 'environment' | 'user';
}

/**
 * Matches the backend's `MAX_UPLOAD_BYTES` (kyc.controller.ts).
 *
 * `accept="image/*,.pdf"` is a file-picker FILTER, not a validation — it is
 * advisory, trivially bypassed, and says nothing about size. So an oversize
 * document was uploaded in full before the server rejected it: on a phone over
 * mobile data, that is a long wait ending in a failure the client could have
 * been told about instantly.
 *
 * The server is still the control — this is UX, and the two numbers are only
 * meaningful together. If they ever disagree the server wins and the client is
 * merely wrong about when to complain, which is the safe direction.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function tooLargeMessage(file: File): string {
  return t('kyc.uploadTooLarge', {
    size: (file.size / (1024 * 1024)).toFixed(1),
    limit: MAX_UPLOAD_BYTES / (1024 * 1024),
  });
}

/**
 * Upload a KYC document.
 *
 * ## Two ways in, deliberately
 *
 * This was a single `<input type="file">` with no `capture` attribute, so on a
 * phone — where nearly every submission comes from — tapping it opened the file
 * BROWSER. The camera was reachable, but as one option among Downloads, Drive
 * and Photos, and the most common action (take a photo of the document now) was
 * the least prominent.
 *
 * The fix is NOT simply to add `capture`. On both iOS and Android a bare
 * `capture` attribute makes the input camera-ONLY, which breaks the other half
 * of the requirement: some people photograph their ID with a second device, or
 * already have a scan, and they must still be able to choose a file. So there
 * are two inputs behind two explicit buttons — one with `capture`, one without —
 * and the dropzone itself still opens the ordinary picker for desktop.
 *
 * ## Preview BEFORE upload
 *
 * The old order was: upload, then render a thumbnail of what was sent. So the
 * first shot was already final in the sense that mattered — on the server, on
 * the API host's disk, attached to the submission — before the client had seen
 * it at any usable size. Every discarded attempt cost a full upload over mobile
 * data and left an orphaned identity document behind.
 *
 * Now the file is shown first and uploaded on confirmation, which is the order
 * `SelfieCamera` has always used in this same repo.
 */
export function DocumentUploader({
  label,
  field,
  accept = 'image/*,.pdf',
  hint,
  uploaded = false,
  onUpload,
  className,
  isErrored = false,
  capture = 'environment',
}: DocumentUploaderProps) {
  const [dragging, setDragging] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  /** Chosen but not yet sent — the confirm/retake step. */
  const [pending, setPending] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    // Revoke nothing: `preview` is a data: URI from FileReader, not an object
    // URL. Kept as an effect-free note so nobody "fixes" it with a revoke call.
  }, []);

  /** Show it. Do not send it yet. */
  const choose = React.useCallback((file: File) => {
    if (!file) return;
    setUploadError(null);
    // Checked before anything else, so the client is told immediately instead of
    // after uploading megabytes they were always going to be refused.
    if (file.size > MAX_UPLOAD_BYTES) {
      setPending(null);
      setPreview(null);
      setFileName(null);
      setUploadError(tooLargeMessage(file));
      return;
    }
    setPending(file);
    setFileName(file.name);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview('pdf');
    }
  }, []);

  const confirm = React.useCallback(async () => {
    if (!pending) return;
    setLoading(true);
    setProgress(0);
    setUploadError(null);
    try {
      await onUpload(field, pending, setProgress);
      setPending(null);
    } catch (err: unknown) {
      // apiErrorMessage, not an inline read of err.response.data.message. This was
      // the fourth hand-rolled copy of that extraction in the two frontends, and
      // like the others it had no `error.message` fallback — so a network failure,
      // which carries no `response`, showed the generic string instead of the
      // reason.
      setUploadError(apiErrorMessage(err, t('kyc.uploadFailed')));
    } finally {
      setLoading(false);
    }
  }, [field, onUpload, pending]);

  const retake = React.useCallback(() => {
    setPending(null);
    setPreview(null);
    setFileName(null);
    setUploadError(null);
  }, []);

  const isUploaded = !!((preview || uploaded) && !pending);
  const openFilePicker = () => fileInputRef.current?.click();
  const openCamera = () => cameraInputRef.current?.click();

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) choose(f);
      }}
      aria-describedby={isErrored ? `${field}-error` : undefined}
      className={`group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-200 min-h-[170px] w-full ${
        dragging
          ? 'border-ring bg-primary/10 shadow-sm'
          : isErrored
            ? // A rejected document must look rejected. The parent has passed
              // this flag since the resubmission flow was built; the component
              // accepted it and rendered it identically to an untouched field,
              // so a client re-uploading had no idea which document to fix.
              'border-destructive/70 bg-destructive/5'
            : isUploaded
              ? 'border-success/40 bg-success/5'
              : 'border-border bg-card/40'
      } ${className || ''}`}
    >
      {/* Two inputs, because `capture` makes an input camera-only. */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) choose(f);
          // Reset, so choosing the SAME file twice still fires onChange —
          // otherwise "retake, pick the same photo" silently does nothing.
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture={capture}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) choose(f);
          e.target.value = '';
        }}
      />

      {loading ? (
        <div className="flex w-full flex-col items-center gap-3 py-2">
          <Loader2 className="h-8 w-8 text-link animate-spin" />
          <div className="space-y-1 w-full max-w-[220px]">
            <p className="text-xs font-semibold text-foreground">{t('kyc.uploadingFile')}</p>
            {/* Determinate, because "please wait" for two minutes on mobile data
                is indistinguishable from a hung request. */}
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('kyc.uploadingFile')}
            >
              <div
                className="h-full bg-primary transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{progress}%</p>
          </div>
        </div>
      ) : pending ? (
        /* Chosen, shown, NOT yet sent. */
        <div className="flex w-full flex-col items-center gap-3">
          {preview && preview !== 'pdf' ? (
            <div className="relative h-32 w-full max-w-[240px] overflow-hidden rounded-xl border border-border bg-muted/40">
              {/* eslint-disable-next-line @next/next/no-img-element -- `preview` is
                  a data: URI produced by FileReader, which next/image cannot
                  optimise; it would need unoptimized and add nothing. */}
              <img src={preview} alt={label} className="h-full w-full object-contain" />
            </div>
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-link">
              <FileText className="h-6 w-6" />
            </div>
          )}
          <p className="max-w-[220px] truncate text-xs text-muted-foreground">{fileName}</p>
          <p className="text-xs font-semibold text-foreground">{t('kyc.checkBeforeSending')}</p>
          {uploadError && (
            <p
              id={`${field}-error`}
              role="alert"
              className="text-xs font-semibold text-destructive"
            >
              {uploadError}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void confirm()}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground focus-outline cursor-pointer"
            >
              {t('kyc.useThisPhoto')}
            </button>
            <button
              type="button"
              onClick={retake}
              className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-xs font-semibold text-foreground focus-outline cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('kyc.chooseAnother')}
            </button>
          </div>
        </div>
      ) : isUploaded ? (
        <div className="flex w-full flex-col items-center gap-3 py-1">
          {preview && preview !== 'pdf' ? (
            <div className="relative h-24 w-full max-w-[200px] overflow-hidden rounded-xl border border-border bg-muted/40">
              {/* eslint-disable-next-line @next/next/no-img-element -- data: URI, see above. */}
              <img src={preview} alt={label} className="h-full w-full object-contain" />
            </div>
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-link">
              <FileText className="h-6 w-6" />
            </div>
          )}

          <div className="max-w-full space-y-1 px-2 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{t('kyc.uploadedSuffix', { label })}</span>
            </div>
            {fileName && (
              <p className="mx-auto max-w-[200px] truncate text-xs text-muted-foreground">
                {fileName}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={retake}
            className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background/80 px-3 py-1.5 text-xs font-semibold text-foreground focus-outline cursor-pointer"
          >
            <RefreshCw className="h-3 w-3 text-muted-foreground" />
            <span>{t('kyc.replaceHint')}</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
              dragging ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-link'
            }`}
          >
            <UploadCloud className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold text-foreground">{label}</p>
            <p className="text-xs font-medium text-muted-foreground">{hint || t('kyc.dropHint')}</p>
            {uploadError && (
              <p
                id={`${field}-error`}
                role="alert"
                className="mt-1 text-xs font-semibold text-destructive"
              >
                {uploadError}
              </p>
            )}
          </div>

          {/* Both routes, both visible. A bare `capture` input would make the
              camera the only option; no `capture` at all buries it in a file
              browser. Neither alone satisfies the requirement. */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={openCamera}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground focus-outline cursor-pointer"
            >
              <Camera className="h-4 w-4" />
              {t('kyc.takePhoto')}
            </button>
            <button
              type="button"
              onClick={openFilePicker}
              className="inline-flex items-center gap-1.5 rounded-lg border border-input px-4 py-2 text-xs font-semibold text-foreground focus-outline cursor-pointer"
            >
              <FolderOpen className="h-4 w-4" />
              {t('kyc.chooseFile')}
            </button>
          </div>

          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('kyc.uploadFormats', { limit: MAX_UPLOAD_BYTES / (1024 * 1024) })}
          </span>
        </div>
      )}
    </div>
  );
}
