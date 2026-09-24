'use client';

import * as React from 'react';
import { Spinner } from '@/components/ui/loader';
import { UploadCloud, CheckCircle2, FileText, RefreshCw, Camera, FolderOpen } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/errors';
import { buildKycDocUrl } from '@/lib/kyc-doc-url';
import { normaliseDocumentImage } from '@/lib/image-capture';
import { t } from '@/lib/i18n';
import { useCanCapture } from '@/hooks/use-can-capture';
import { Button } from '@/components/ui/button';

export interface DocumentUploaderProps {
  label: string;
  field: string;
  accept?: string;
  hint?: string;
  uploaded?: boolean;
  onUpload: (field: string, file: File, onProgress?: (percent: number) => void) => Promise<void>;
  /**
   * Told when a file is chosen but NOT yet sent.
   *
   * The step needs this to tell two situations apart that look identical to it:
   * nothing chosen at all, and a photo sitting right there waiting for one
   * click. Both leave `uploadsState[field]` false, so without this the step's
   * only honest message is "please upload" — which is what a client saw while
   * looking at their own photo, and it cost them real time working out that
   * "Use this" was the missing step.
   */
  onPendingChange?: (field: string, hasPending: boolean) => void;
  className?: string;
  /** The admin rejected this specific field — show it, don't just track it. */
  isErrored?: boolean;
  /**
   * Where the server keeps the file this slot already holds, so a client
   * coming back sees the picture they sent — not a generic file icon beside
   * "uploaded", which told them nothing about WHICH photo was on file.
   */
  storedFilePath?: string;
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
/**
 * Can this device actually TAKE a photo from a file input?
 *
 * `capture` is honoured by phones and tablets and IGNORED by every desktop
 * browser — the input falls back to an ordinary file picker. So on a laptop the
 * "Take photo" button opened exactly the same dialog as "Choose file": two
 * buttons, one outcome, and a reader left wondering which one they got wrong.
 *
 * `(pointer: coarse)` is the honest question — "is this a touch device", which
 * is the same set of devices whose file input opens a camera. It is read
 * through `useHydrated` because the server cannot know it: rendering the mobile
 * answer during SSR and the desktop one after hydration is a layout jump on the
 * step where clients are already unsure what to press.
 *
 * On desktop the dropzone and "Choose file" remain, which is the whole
 * interaction there anyway — a passport photographed on a laptop webcam is a
 * rejected submission, so this removes a button nobody should have used.
 */
export function DocumentUploader({
  label,
  field,
  accept = 'image/*,.pdf',
  hint,
  uploaded = false,
  onUpload,
  onPendingChange,
  className,
  isErrored = false,
  capture = 'environment',
  storedFilePath,
}: DocumentUploaderProps) {
  const [dragging, setDragging] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  /** Chosen but not yet sent — the confirm/retake step. */
  const [pending, setPending] = React.useState<File | null>(null);
  /*
   * The client asked to replace a document that is ALREADY on the server.
   *
   * Needed because `uploaded` is a prop, not state. `retake` clears everything
   * this component owns, but it cannot clear the parent's flag — so after a
   * successful upload `isUploaded` stayed true no matter what was cleared, the
   * uploaded view re-rendered identically, and Replace looked like a dead
   * button. This is the one piece of "yes, I know it is uploaded, show me the
   * picker anyway" that lives here rather than upstream.
   */
  const [replacing, setReplacing] = React.useState(false);
  /** Rotating, shrinking and stripping metadata — before anything is shown. */
  const [preparing, setPreparing] = React.useState(false);
  /** The normalised image is below the readable floor. A warning, not a block. */
  const [tooSmall, setTooSmall] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const canCapture = useCanCapture();

  React.useEffect(() => {
    // Revoke nothing: `preview` is a data: URI from FileReader, not an object
    // URL. Kept as an effect-free note so nobody "fixes" it with a revoke call.
  }, []);

  /**
   * Show it. Do not send it yet.
   *
   * The file is normalised FIRST (`lib/image-capture.ts`): rotated upright from
   * its EXIF tag, stripped of the GPS coordinates a phone camera writes, and
   * scaled down only if it is larger than a reviewer could use. So the preview
   * below is what the reviewer will actually see — which is the point of having
   * a preview at all, and was not true when the raw file was previewed and the
   * raw file was sent.
   *
   * The size check runs AFTER, on the normalised file, because normalisation is
   * usually what brings a 12 MB camera original under the limit. Checking first
   * would refuse photos that were about to become perfectly acceptable.
   */
  const choose = React.useCallback(async (file: File) => {
    if (!file) return;
    setUploadError(null);
    setTooSmall(false);
    setPreparing(true);
    try {
      const normalised = await normaliseDocumentImage(file);

      if (normalised.file.size > MAX_UPLOAD_BYTES) {
        setPending(null);
        setPreview(null);
        setFileName(null);
        setUploadError(tooLargeMessage(normalised.file));
        return;
      }

      setPending(normalised.file);
      setFileName(file.name);
      // Advisory, not a block: a legitimate small scan refused outright is a
      // worse outcome than a marginal one a reviewer can judge for themselves.
      setTooSmall(normalised.tooSmall);

      if (normalised.file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target?.result as string);
        reader.readAsDataURL(normalised.file);
      } else {
        setPreview('pdf');
      }
    } finally {
      setPreparing(false);
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
      // The replacement landed, so stop overriding the uploaded view — it now
      // shows the new document. Only on success: a failed upload must leave the
      // client on the picker with the error, not back on the old file.
      setReplacing(false);
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

  /*
   * Report the pending transition from ONE place.
   *
   * `setPending` is called at four sites (chosen, cleared, uploaded, retaken)
   * and threading the callback through each is how one of them gets missed —
   * leaving the step convinced a file is still waiting when it is not, which is
   * a worse failure than the one this fixes.
   */
  React.useEffect(() => {
    onPendingChange?.(field, pending !== null);
  }, [field, pending, onPendingChange]);

  const isUploaded = !!((preview || uploaded) && !pending && !replacing);

  /** Replace an already-uploaded document: clear this component, show the picker. */
  const replace = React.useCallback(() => {
    retake();
    setReplacing(true);
  }, [retake]);
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
        if (f) void choose(f);
      }}
      aria-describedby={isErrored ? `${field}-error` : undefined}
      /* A handle for the e2e that guards the label surviving the preview
         state (kyc-wizard.spec.ts). The tile is a div with no role and no
         accessible name of its own — the alternative was a test coupled to
         Tailwind class names, which breaks on a restyle and says nothing
         about the behaviour. */
      data-testid="kyc-document-tile"
      className={`group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-200 min-h-[170px] w-full ${
        dragging
          ? 'border-ring bg-primary/10'
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
          if (f) void choose(f);
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
          if (f) void choose(f);
          e.target.value = '';
        }}
      />

      {preparing ? (
        <div className="flex flex-col items-center gap-3 py-2">
          <Spinner size="lg" className="text-link" />
          <p className="text-xs font-semibold text-foreground">{t('kyc.preparingImage')}</p>
        </div>
      ) : loading ? (
        <div className="flex w-full flex-col items-center gap-3 py-2">
          <Spinner size="lg" className="text-link" />
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
          {/*
            The LABEL stays visible while confirming, and that is the point.
            This state used to show the filename and the quality question and
            nothing else — so on a step with two tiles ("Primary Page (Page 1)"
            and "Page 2 / Supporting Document") both previews looked identical,
            and there was no way to tell which one you were about to confirm.
            A camera filename like 8683608071553.jpg identifies nothing.
          */}
          <p className="text-xs font-bold text-foreground">{label}</p>
          <p className="max-w-[220px] truncate text-xs text-muted-foreground">{fileName}</p>
          <p className="text-xs font-semibold text-foreground">{t('kyc.checkBeforeSending')}</p>
          {tooSmall && (
            <p role="status" className="max-w-[240px] text-xs font-semibold text-warning">
              {t('kyc.lowResolutionWarning')}
            </p>
          )}
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
            <Button type="button" size="sm" onClick={() => void confirm()}>
              {t('kyc.useThisPhoto')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={retake}>
              <RefreshCw className="h-3.5 w-3.5" />
              {t('kyc.chooseAnother')}
            </Button>
          </div>
        </div>
      ) : isUploaded ? (
        <div className="flex w-full flex-col items-center gap-3 py-1">
          {preview && preview !== 'pdf' ? (
            <div className="relative h-24 w-full max-w-[200px] overflow-hidden rounded-xl border border-border bg-muted/40">
              {/* eslint-disable-next-line @next/next/no-img-element -- data: URI, see above. */}
              <img src={preview} alt={label} className="h-full w-full object-contain" />
            </div>
          ) : !preview && storedFilePath && !/\.pdf$/i.test(storedFilePath) ? (
            <div className="relative h-24 w-full max-w-[200px] overflow-hidden rounded-xl border border-border bg-muted/40">
              {/* eslint-disable-next-line @next/next/no-img-element -- served by the API
                  with the client's own session, the same way the document viewer
                  shows it; next/image would proxy it through this app. */}
              <img
                src={buildKycDocUrl(storedFilePath)}
                alt={label}
                className="h-full w-full object-contain"
              />
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

          <Button type="button" variant="outline" size="sm" onClick={replace}>
            <RefreshCw className="h-3 w-3 text-muted-foreground" />
            <span>{t('kyc.replaceHint')}</span>
          </Button>
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

          {/* On a phone, both routes are offered: a bare `capture` input would
              make the camera the only option, and no `capture` at all buries it
              among Downloads and Drive. On a desktop `capture` does nothing, so
              the second button would open the identical dialog — one button
              there, and it is the one that describes what actually happens. */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {canCapture && (
              <Button type="button" size="sm" onClick={openCamera}>
                <Camera className="h-4 w-4" />
                {t('kyc.takePhoto')}
              </Button>
            )}
            <Button
              type="button"
              variant={canCapture ? 'outline' : 'default'}
              size="sm"
              onClick={openFilePicker}
            >
              <FolderOpen className="h-4 w-4" />
              {t('kyc.chooseFile')}
            </Button>
          </div>

          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('kyc.uploadFormats', { limit: MAX_UPLOAD_BYTES / (1024 * 1024) })}
          </span>
        </div>
      )}
    </div>
  );
}
