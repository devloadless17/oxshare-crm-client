'use client';

import * as React from 'react';
import { AlertCircle, Camera, CheckCircle2, Loader2, RefreshCw, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

export interface SelfieCameraProps {
  onUpload: (field: string, file: File) => Promise<void>;
  uploaded?: boolean;
}

/**
 * A canvas as a JPEG blob.
 *
 * Promisified because `toBlob` is callback-based. A null result means the
 * browser could not encode the canvas — rare, but it must reject rather than
 * upload an empty file, which would reach the reviewer as a corrupt selfie and
 * be rejected as the client's fault.
 */
function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(t('kyc.encodeFailed')))),
      'image/jpeg',
    );
  });
}

export function SelfieCamera({ onUpload, uploaded = false }: SelfieCameraProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const [captured, setCaptured] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadedSuccess, setUploadedSuccess] = React.useState(uploaded);
  const [cameraError, setCameraError] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  const stopCamera = React.useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = React.useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });

      streamRef.current = s;

      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
      // Cleared only once the camera is actually running. Resetting it up front
      // flashed the error away before we knew whether this attempt would work.
      setCameraError(false);
    } catch {
      setCameraError(true);
    }
  }, []);

  // Acquiring the camera is external-system synchronisation — the textbook
  // case an effect is for. getUserMedia is also the only way to do it: there
  // is no render-time equivalent, and it must be released on unmount or the
  // camera light stays on after the user navigates away.
  React.useEffect(() => {
    if (!uploadedSuccess && !captured) {
      // The rule traces into startCamera and sees setCameraError, which is set
      // from the getUserMedia result — i.e. from the external system, which is
      // the pattern the rule itself documents as correct.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [uploadedSuccess, captured, startCamera, stopCamera]);

  const capture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg');
    setCaptured(dataUrl);
    stopCamera();

    /*
     * Upload the captured frame.
     *
     * This used to be `catch { /* ignore *\/ }`, and `captured` is set above
     * BEFORE the upload is attempted — so a failed upload left the client looking
     * at their own photo under a "{t('kyc.selfieCaptured')}" badge, believing they had
     * submitted a selfie that never reached the server. They found out when KYC was
     * rejected for a missing selfie.
     */
    setUploadError(null);
    setUploading(true);
    try {
      /*
       * canvas.toBlob, not fetch(dataUrl).blob().
       *
       * The old path round-tripped the capture through a `data:` URL and asked
       * `fetch` to parse it back. Two problems with that:
       *
       *  1. CSP. `fetch()` is governed by `connect-src`, and next.config.ts sets
       *     `connect-src 'self'` in production — a `data:` URL is not 'self'.
       *     The three deliberate KYC exceptions in that file cover `img-src` and
       *     `media-src`, which is DISPLAYING the capture, not converting it. So
       *     this was liable to fail in production while working in development,
       *     surfacing as "Could not upload your selfie. Please retake it." on the
       *     step that gates FR-CORE-15, indistinguishable from a network fault.
       *  2. It was awkward enough to need shimming in tests twice — first for
       *     `new Response(new Blob(...))`, then again for Node/undici/jsdom Blob
       *     interop across Node versions.
       *
       * `toBlob` is the API for this, produces the same bytes, needs no network
       * stack and no CSP allowance. The data URL is still used for the preview,
       * which is what `img-src data:` exists for.
       */
      const blob = await canvasToJpegBlob(canvas);
      const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
      await onUpload('selfie', file);
      setUploadedSuccess(true);
    } catch (err: unknown) {
      setUploadError(apiErrorMessage(err, t('kyc.selfieFailed')));
    } finally {
      setUploading(false);
    }
  };

  const handleRetake = () => {
    setCaptured(null);
    setUploadedSuccess(false);
    setUploadError(null);
    void startCamera();
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-6 w-full max-w-md mx-auto py-2">
      {/* Live Camera View */}
      {!captured && !uploadedSuccess && (
        <div className="flex flex-col items-center space-y-4 w-full">
          <div className="relative h-72 w-72 overflow-hidden rounded-full border-4 border-primary/40 shadow-lg shadow-primary/10 bg-muted/40 flex items-center justify-center">
            {cameraError ? (
              /*
               * A live capture is REQUIRED for the selfie, and deliberately so:
               * a photograph of a photograph proves nothing about who is
               * holding the phone, which is the entire point of this step. An
               * uploaded file is accepted for the ID and the proof of address —
               * those are documents, and their authenticity is judged by the
               * reviewer looking at them.
               *
               * So there is no file fallback here. What there IS is a way out
               * of the dead end: the camera can be blocked by a permission the
               * client denied earlier, or by an in-app browser (the one inside
               * a social app) that does not grant getUserMedia at all. Without
               * this text, that client cannot complete verification and has no
               * idea why.
               */
              <div className="flex flex-col items-center gap-2 p-4 text-center">
                <VideoOff className="h-10 w-10 text-destructive" />
                <p className="text-xs font-bold text-foreground">{t('kyc.cameraDeniedTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('kyc.cameraDeniedBody')}</p>
                <p className="text-xs text-muted-foreground">{t('kyc.cameraDeniedHow')}</p>
                <Button size="sm" onClick={() => void startCamera()} className="mt-2 text-xs">
                  {t('kyc.cameraRetry')}
                </Button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover transform -scale-x-100"
                />
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-primary/60 pointer-events-none animate-pulse" />
              </>
            )}
          </div>

          <p className="text-xs font-medium text-muted-foreground text-center">
            {t('kyc.cameraHint')}
          </p>

          {!cameraError && (
            <Button
              type="button"
              onClick={() => void capture()}
              disabled={uploading}
              className="gap-2 rounded-full px-6 py-5 shadow-sm shadow-primary/20 text-sm font-bold cursor-pointer"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>{t('kyc.processing')}</span>
                </>
              ) : (
                <>
                  <Camera className="h-5 w-5" />
                  <span>{t('kyc.snapPhoto')}</span>
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Captured or Previously Uploaded Photo Preview */}
      {(captured || uploadedSuccess) && (
        <div className="flex flex-col items-center space-y-4 w-full">
          <div className="relative h-72 w-72 overflow-hidden rounded-full border-4 border-success/50 shadow-lg shadow-success/10 bg-muted flex items-center justify-center">
            {captured ? (
              /* eslint-disable-next-line @next/next/no-img-element -- `captured` is
                 a data: URI from canvas.toDataURL(), which next/image cannot
                 optimise; it would need unoptimized and add nothing. */
              <img
                src={captured}
                alt={t('kyc.selfiePreviewAlt')}
                className="h-full w-full object-cover transform -scale-x-100"
              />
            ) : (
              <CheckCircle2 className="h-16 w-16 text-success" />
            )}
          </div>

          <div className="flex flex-col items-center gap-3">
            {uploadError ? (
              <div
                role="alert"
                className="flex items-center gap-1.5 text-xs font-bold text-destructive bg-destructive/10 border border-destructive/30 px-4 py-2 rounded-xl max-w-xs text-center"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            ) : uploading ? (
              <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('kyc.uploadingSelfie')}</span>
              </div>
            ) : (
              // Only once the upload has actually landed.
              uploadedSuccess && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-success bg-success/10 border border-success/30 px-4 py-2 rounded-xl">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{t('kyc.selfieCaptured')}</span>
                </div>
              )
            )}
            <Button
              type="button"
              variant="outline"
              onClick={handleRetake}
              className="gap-2 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{t('kyc.retakePhoto')}</span>
            </Button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
