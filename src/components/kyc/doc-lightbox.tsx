'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCw, X } from 'lucide-react';
import { buildKycDocUrl } from '@/lib/kyc-doc-url';
import { direction, t } from '@/lib/i18n';

export interface LightboxDoc {
  filePath: string;
  label: string;
}

const ZOOM_STEP = 0.5;
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

/**
 * A client's own KYC document at full size, with zoom, pan and rotation.
 *
 * The same viewer the admin review screen uses (`components/kyc-review/
 * doc-lightbox.tsx` there), so a client looking at a returned document sees it
 * the way the reviewer did — and can tell for themselves whether the photo is
 * blurred, cropped or merely sideways before re-uploading it. Not a twin file:
 * the admin copy carries its own focus trap, while this one sits on the Radix
 * dialog the portal already ships, which provides the trap, Escape and the
 * scroll lock.
 *
 * The zoom and rotation are presentational and never sent anywhere — the
 * stored file is evidence, and a viewing aid must not alter it.
 */
export function DocLightbox({
  docs,
  index,
  onClose,
  onNavigate,
}: {
  docs: LightboxDoc[];
  index: number;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [turns, setTurns] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragFrom = useRef<{ x: number; y: number } | null>(null);

  const doc = docs[index];
  const isPdf = doc?.filePath.toLowerCase().endsWith('.pdf');

  // A new document is a new view — reset here rather than in an effect keyed on
  // `index`, which would paint the new document at the old zoom first.
  const navigate = useCallback(
    (next: number) => {
      setZoom(1);
      setTurns(0);
      setOffset({ x: 0, y: 0 });
      onNavigate(next);
    },
    [onNavigate],
  );

  const go = useCallback(
    (delta: number) => {
      if (docs.length < 2) return;
      navigate((index + delta + docs.length) % docs.length);
    },
    [docs.length, index, navigate],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The NEXT document sits to the left in a right-to-left page.
      const forward = direction() === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      const back = direction() === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === forward) go(1);
      else if (e.key === back) go(-1);
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
      else if (e.key === '-') setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
      else if (e.key === 'r') setTurns((n) => (n + 1) % 4);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  if (!doc) return null;
  const src = buildKycDocUrl(doc.filePath);

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm animate-in fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[100] flex flex-col focus:outline-none"
          // The backdrop closes, but only the backdrop itself — a drag that ends
          // outside the image must not dismiss the document being read.
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="truncate text-sm font-semibold text-white">
                {doc.label}
              </DialogPrimitive.Title>
            </div>

            <div className="flex items-center gap-1">
              <LightboxButton
                onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
                disabled={zoom <= MIN_ZOOM || isPdf}
                label={t('kyc.viewer.zoomOut')}
              >
                <Minus className="h-4 w-4" />
              </LightboxButton>
              <span className="w-12 text-center text-xs font-semibold text-white/80">
                {Math.round(zoom * 100)}%
              </span>
              <LightboxButton
                onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
                disabled={zoom >= MAX_ZOOM || isPdf}
                label={t('kyc.viewer.zoomIn')}
              >
                <Plus className="h-4 w-4" />
              </LightboxButton>
              <LightboxButton
                onClick={() => setTurns((n) => (n + 1) % 4)}
                disabled={isPdf}
                label={t('kyc.viewer.rotate')}
              >
                <RotateCw className="h-4 w-4" />
              </LightboxButton>
              <LightboxButton onClick={onClose} label={t('common.close')}>
                <X className="h-4 w-4" />
              </LightboxButton>
            </div>
          </header>

          <div
            className="relative flex flex-1 items-center justify-center overflow-hidden"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            {docs.length > 1 && (
              <LightboxNav side="start" onClick={() => go(-1)} label={t('kyc.viewer.previous')} />
            )}

            {isPdf ? (
              // A PDF is not an image: zoom and rotation belong to the browser's
              // own viewer, which beats an <embed> inside a modal.
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-white/10 px-6 py-4 text-sm font-semibold text-white hover:bg-white/20 focus-outline"
              >
                {t('kyc.viewer.openPdf')}
              </a>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element -- served from
                 the API origin behind auth; next/image would proxy identity
                 documents through the optimizer and cache them on disk. */
              <img
                src={src}
                alt={doc.label}
                draggable={false}
                // Pointer events so pan works for touch and pen as well as a
                // mouse; capture keeps the drag alive past the image's edge.
                onPointerDown={(e) => {
                  if (zoom <= 1) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  dragFrom.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
                }}
                onPointerMove={(e) => {
                  if (!dragFrom.current) return;
                  setOffset({
                    x: e.clientX - dragFrom.current.x,
                    y: e.clientY - dragFrom.current.y,
                  });
                }}
                onPointerUp={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                  dragFrom.current = null;
                }}
                onPointerCancel={() => (dragFrom.current = null)}
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${turns * 90}deg)`,
                  cursor: zoom > 1 ? 'grab' : 'default',
                }}
                className="max-h-[80dvh] max-w-[92vw] touch-none select-none object-contain transition-transform duration-100"
              />
            )}

            {docs.length > 1 && (
              <LightboxNav side="end" onClick={() => go(1)} label={t('kyc.viewer.next')} />
            )}
          </div>

          {docs.length > 1 && (
            <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 px-4 py-2">
              {docs.map((d, i) => (
                <button
                  key={d.filePath}
                  type="button"
                  onClick={() => navigate(i)}
                  aria-current={i === index}
                  className={`cursor-pointer rounded px-2 py-1 text-xs font-semibold focus-outline ${
                    i === index ? 'bg-white text-black' : 'text-white/70 hover:text-white'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </footer>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function LightboxButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/80 hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 focus-outline"
    >
      {children}
    </button>
  );
}

/** `start`/`end` so "previous" sits at the start of the reading direction under RTL. */
function LightboxNav({
  side,
  onClick,
  label,
}: {
  side: 'start' | 'end';
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`absolute ${side === 'start' ? 'start-2' : 'end-2'} z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 focus-outline`}
    >
      {side === 'start' ? (
        <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
      ) : (
        <ChevronRight className="h-5 w-5 rtl:rotate-180" />
      )}
    </button>
  );
}
