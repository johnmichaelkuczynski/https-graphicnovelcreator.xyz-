import React, { useState, useEffect } from 'react';

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
