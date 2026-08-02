'use client';

import * as React from 'react';
import { UploadCloud, CheckCircle2, FileText, Loader2, RefreshCw } from 'lucide-react';

export interface DocumentUploaderProps {
  label: string;
  field: string;
  accept?: string;
  hint?: string;
  uploaded?: boolean;
  isErrored?: boolean;
  onUpload: (field: string, file: File) => Promise<void>;
  className?: string;
}

export function DocumentUploader({
  label,
  field,
  accept = 'image/*,.pdf',
  hint,
  uploaded = false,
  isErrored = false,
  onUpload,
  className,
}: DocumentUploaderProps) {
  const [dragging, setDragging] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = React.useCallback(
    async (file: File) => {
      if (!file) return;
      setLoading(true);
      setUploadError(null);
      try {
        await onUpload(field, file);
        setFileName(file.name);
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => setPreview(e.target?.result as string);
          reader.readAsDataURL(file);
        } else {
          setPreview('pdf');
        }
      } catch (err: unknown) {
        setPreview(null);
        setFileName(null);
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message || 'Upload failed. Please try again.';
        setUploadError(msg);
      } finally {
        setLoading(false);
      }
    },
    [field, onUpload],
  );

  const isUploaded = !!(preview || uploaded);

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
        if (f) handleFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={`group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-200 cursor-pointer min-h-[170px] w-full ${
        dragging
          ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20 scale-[1.01]'
          : isUploaded
          ? 'border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60'
          : 'border-border bg-card/40 hover:border-blue-500/40 hover:bg-muted/30'
      } ${className || ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-2">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-foreground">Uploading File...</p>
            <p className="text-[11px] text-muted-foreground">Please wait a moment</p>
          </div>
        </div>
      ) : isUploaded ? (
        <div className="flex flex-col items-center gap-3 py-1 w-full">
          {preview && preview !== 'pdf' ? (
            <div className="relative h-20 w-32 overflow-hidden rounded-xl border border-border shadow-sm">
              <img src={preview} alt={label} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
              <FileText className="h-6 w-6" />
            </div>
          )}

          <div className="space-y-1 text-center max-w-full px-2">
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-500">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{label} Uploaded</span>
            </div>
            {fileName && (
              <p className="text-[11px] text-muted-foreground truncate max-w-[200px] mx-auto">
                {fileName}
              </p>
            )}
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background/80 px-3 py-1 text-[11px] font-semibold text-foreground shadow-2xs group-hover:bg-muted transition-colors mt-1">
            <RefreshCw className="h-3 w-3 text-muted-foreground" />
            <span>Click or drag to replace</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2.5">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-transform group-hover:scale-110 ${
              dragging ? 'bg-blue-600 text-white' : 'bg-blue-500/10 text-blue-500'
            }`}
          >
            <UploadCloud className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold text-foreground">{label}</p>
            <p className="text-[11px] font-medium text-muted-foreground">
              {hint || 'Drag & drop your file here, or click to browse'}
            </p>
            {uploadError && (
              <p className="text-[11px] font-semibold text-rose-500 mt-1">{uploadError}</p>
            )}
          </div>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            PNG, JPG, PDF · Max 10MB
          </span>
        </div>
      )}
    </div>
  );
}
