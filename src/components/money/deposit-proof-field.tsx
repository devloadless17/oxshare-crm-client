'use client';

import * as React from 'react';
import { Camera, FileText, ImageIcon, Upload, X } from 'lucide-react';
import { normaliseDocumentImage } from '@/lib/image-capture';
import { t } from '@/lib/i18n';
import { useCanCapture } from '@/hooks/use-can-capture';
import { Button } from '@/components/ui/button';

/**
 * The transfer receipt an OFFLINE deposit is filed with.
 *
 * ## Why this is not `components/kyc/document-uploader.tsx`
 *
 * That component UPLOADS: it posts the file the moment the client confirms it,
 * owns a progress bar, and moves through pending → uploaded → replace. Its whole
 * state machine exists because the KYC wizard attaches a document to a
 * submission that already exists.
 *
 * A receipt has nowhere to go yet. The deposit row does not exist until the form
 * is submitted, so this holds a File and hands it to the form — there is no
 * request to show progress for, and no uploaded state to replace. Reusing that
 * component would mean disabling the half of it that does the work.
 *
 * What IS shared is the part that matters: `normaliseDocumentImage`, which
 * rotates by EXIF, STRIPS GPS, and downscales. A receipt photographed at home
 * otherwise carries the client's coordinates into the admin console, and a
 * sideways receipt is a rejected deposit.
 */
export function DepositProofField({
  file,
  onChange,
  disabled,
  maxBytes,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  /** Mirrors the server's own ceiling, so the refusal arrives before the upload. */
  maxBytes: number;
}) {
  const pick = React.useRef<HTMLInputElement>(null);
  const capture = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [preparing, setPreparing] = React.useState(false);
  /*
   * Only a device with a real camera is offered one.
   *
   * `capture="environment"` asks the browser for the camera; a laptop IGNORES it
   * and opens the ordinary picker. So on a desktop "Take photo" and "Choose
   * file" were two buttons doing exactly the same thing, which reads as one of
   * them being broken. Reported from the running app.
   */
  const canCapture = useCanCapture();

  const choose = async (picked: File | undefined) => {
    if (!picked) return;
    setProblem(null);
    setPreparing(true);
    try {
      // PDFs pass through untouched — there is no EXIF to rotate and no canvas
      // that can re-encode one.
      const isPdf = picked.type === 'application/pdf';
      const ready = isPdf ? picked : (await normaliseDocumentImage(picked)).file;

      if (ready.size > maxBytes) {
        setProblem(
          t('deposit.proofTooLarge', {
            size: (ready.size / (1024 * 1024)).toFixed(1),
            limit: String(Math.round(maxBytes / (1024 * 1024))),
          }),
        );
        return;
      }

      onChange(ready);
      setPreview(isPdf ? null : URL.createObjectURL(ready));
    } catch {
      setProblem(t('deposit.proofFailed'));
    } finally {
      setPreparing(false);
    }
  };

  // The object URL is a live handle on the file; letting it outlive the preview
  // leaks the blob for the life of the page.
  React.useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const clear = () => {
    onChange(null);
    setPreview(null);
    setProblem(null);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{t('deposit.proofTitle')}</p>
      <p className="text-xs text-muted-foreground">{t('deposit.proofBody')}</p>

      <input
        ref={pick}
        type="file"
        accept="image/*,.pdf"
        data-testid="deposit-proof-input"
        className="hidden"
        // Reset, so picking the SAME file again still fires a change event.
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={capture}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          {preview ? (
            /* A blob: URL from the client's own pick — next/image cannot
               optimise one, and there is nothing to optimise: it never leaves
               the browser. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-14 w-14 rounded object-cover" />
          ) : (
            <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{file.name}</span>
          <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={disabled}>
            <X className="h-4 w-4" aria-hidden />
            <span className="sr-only">{t('deposit.proofRemove')}</span>
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          {canCapture && (
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1"
              disabled={disabled || preparing}
              onClick={() => capture.current?.click()}
            >
              <Camera className="me-2 h-4 w-4" aria-hidden />
              {t('deposit.proofTakePhoto')}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-10 flex-1"
            disabled={disabled || preparing}
            onClick={() => pick.current?.click()}
          >
            <Upload className="me-2 h-4 w-4" aria-hidden />
            {/* On a phone the two sit side by side, so this one has to say what
                it is NOT — the gallery, rather than the camera. On a desktop it
                stands alone and says the plain thing. */}
            {canCapture ? t('deposit.proofChooseExisting') : t('deposit.proofChooseFile')}
          </Button>
        </div>
      )}

      {preparing && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ImageIcon className="h-3 w-3" aria-hidden />
          {t('deposit.proofPreparing')}
        </p>
      )}
      {problem && <p className="text-xs text-destructive">{problem}</p>}
      {!file && !problem && (
        <p className="text-[11px] text-muted-foreground">
          {t('deposit.proofFormats', { limit: String(Math.round(maxBytes / (1024 * 1024))) })}
        </p>
      )}
    </div>
  );
}
