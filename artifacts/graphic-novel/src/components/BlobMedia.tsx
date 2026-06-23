import React, { useState, useEffect } from 'react';

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

// Renders 1–4 panel images as a collage of cover tiles. A single image fills
// the area (matching the grid thumbnail's existing look); multiple images are
// shown as an even grid. With 3 images the third spans the full bottom row.
// Pass `onRemove` to show a per-tile remove button on hover.
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

  return (
    <div
      className={`grid gap-0.5 bg-border ${className ?? ''}`}
      style={{
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: count <= 2 ? '1fr' : '1fr 1fr',
      }}
    >
      {urls.map((url, i) => (
        <div
          key={i}
          className="relative overflow-hidden bg-muted group/tile"
          style={count === 3 && i === 2 ? { gridColumn: '1 / span 2' } : undefined}
        >
          <img src={url} className="w-full h-full object-cover" alt="" />
          {onRemove && <RemoveTileButton onClick={() => onRemove(i)} />}
        </div>
      ))}
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
      className="absolute top-1 right-1 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-background/90 border-2 border-border text-foreground opacity-0 group-hover/img:opacity-100 hover:bg-destructive hover:text-white transition-opacity"
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
