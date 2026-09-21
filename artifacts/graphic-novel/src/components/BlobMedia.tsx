import React, { useState, useEffect } from 'react';
import { collageRows } from '@/lib/collage';

// Creates (and revokes) one object URL per blob. The caller must pass a stable
// `blobs` array reference (e.g. via useMemo keyed on the panel) so URLs aren't
// recreated every render.
function useObjectUrls(blobs: Blob[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const made = blobs.filter(Boolean).map((b) => URL.createObjectURL(b));
    setUrls(made);
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [blobs]);
  return urls;
}

// Renders 1–8 panel images as a collage of cover tiles. A single image fills
// the area (matching the grid thumbnail's existing look); multiple images are
// laid out in rows (see `collageRows`) so the same arrangement is used in the
// PDF/video export. Pass `onRemove` to show a per-tile remove button on hover.
export function ImageCollage({
  blobs,
  className,
  onRemove,
}: {
  blobs: Blob[];
  className?: string;
  onRemove?: (index: number) => void;
}) {
  const urls = useObjectUrls(blobs);
  const count = urls.length;

  if (count === 0) return <div className={className} aria-hidden />;

  if (count === 1) {
    return (
      <div className={`relative ${className ?? ''}`}>
        <img src={urls[0]} className="w-full h-full object-cover" alt="" />
        {onRemove && (
          <RemoveTileButton onClick={() => onRemove(0)} />
        )}
      </div>
    );
  }

  const rows = collageRows(count);
  let start = 0;

  return (
    <div className={`flex flex-col gap-0.5 bg-border ${className ?? ''}`}>
      {rows.map((rowLen, r) => {
        const s = start;
        start += rowLen;
        return (
          <div key={r} className="flex gap-0.5 flex-1 min-h-0">
            {urls.slice(s, s + rowLen).map((url, j) => {
              const i = s + j;
              return (
                <div
                  key={i}
                  className="relative overflow-hidden bg-muted group/tile flex-1 min-w-0"
                >
                  <img src={url} className="w-full h-full object-cover" alt="" />
                  {onRemove && <RemoveTileButton onClick={() => onRemove(i)} />}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function RemoveTileButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      title="Remove this photo"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="tile-remove absolute top-1 right-1 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-background/90 border-2 border-border text-foreground opacity-0 group-hover/img:opacity-100 group-hover/tile:opacity-100 hover:bg-destructive hover:text-white transition-opacity"
    >
      <span className="text-xs font-bold leading-none">✕</span>
    </button>
  );
}

export function BlobImage({ blob, className, alt = "" }: { blob: Blob; className?: string; alt?: string }) {
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  if (!url) return <div className={className} aria-hidden />;

  return <img src={url} className={className} alt={alt} />;
}

export function BlobAudio({ blob, className, controls = true, loop = false, onEnded }: { blob: Blob; className?: string; controls?: boolean; loop?: boolean; onEnded?: () => void }) {
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  if (!url) return null;

  return (
    <audio 
      src={url} 
      className={className} 
      controls={controls} 
      loop={loop} 
      onEnded={onEnded}
    />
  );
}
