'use client';

import * as React from 'react';
import { Camera, VideoOff, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface SelfieCameraProps {
  onUpload: (field: string, file: File) => Promise<void>;
  uploaded?: boolean;
}

export function SelfieCamera({ onUpload, uploaded = false }: SelfieCameraProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const [isCameraActive, setIsCameraActive] = React.useState(false);
  const [captured, setCaptured] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadedSuccess, setUploadedSuccess] = React.useState(uploaded);
  const [cameraError, setCameraError] = React.useState(false);

  const stopCamera = React.useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  const startCamera = React.useCallback(async () => {
    try {
      setCameraError(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });

      streamRef.current = s;
      setIsCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
    } catch {
      setCameraError(true);
      setIsCameraActive(false);
    }
  }, []);

  React.useEffect(() => {
    if (!uploadedSuccess && !captured) {
      startCamera();
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

    // Auto-upload captured selfie in background
    setUploading(true);
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
      await onUpload('selfie', file);
      setUploadedSuccess(true);
    } catch {
      // ignore
    } finally {
      setUploading(false);
    }
  };

  const handleRetake = () => {
    setCaptured(null);
    setUploadedSuccess(false);
    startCamera();
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-6 w-full max-w-md mx-auto py-2">
      {/* Live Camera View */}
      {!captured && !uploadedSuccess && (
        <div className="flex flex-col items-center space-y-4 w-full">
          <div className="relative h-72 w-72 overflow-hidden rounded-full border-4 border-primary/40 shadow-lg shadow-primary/10 bg-muted/40 flex items-center justify-center">
            {cameraError ? (
              <div className="flex flex-col items-center gap-2 p-4 text-center">
                <VideoOff className="h-10 w-10 text-destructive" />
                <p className="text-xs font-bold text-foreground">Camera Access Required</p>
                <p className="text-[11px] text-muted-foreground">
                  Please allow camera permissions in your browser to take your selfie.
                </p>
                <Button size="sm" onClick={startCamera} className="mt-2 text-xs">
                  Retry Camera
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
            Center your face inside the circle and click snap photo.
          </p>

          {!cameraError && (
            <Button
              type="button"
              onClick={capture}
              disabled={uploading}
              className="gap-2 rounded-full px-6 py-5 shadow-sm shadow-primary/20 text-sm font-bold cursor-pointer"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Camera className="h-5 w-5" />
                  <span>Snap Photo</span>
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
              <img
                src={captured}
                alt="Selfie preview"
                className="h-full w-full object-cover transform -scale-x-100"
              />
            ) : (
              <CheckCircle2 className="h-16 w-16 text-success" />
            )}
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-success bg-success/10 border border-success/30 px-4 py-2 rounded-xl">
              <CheckCircle2 className="h-4 w-4" />
              <span>Selfie Captured</span>
            </div>
            <Button type="button" variant="outline" onClick={handleRetake} className="gap-2 text-xs">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retake Photo</span>
            </Button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
