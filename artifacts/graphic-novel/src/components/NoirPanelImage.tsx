import { useEffect, useState } from 'react';
import { renderNoirPanel } from '@/lib/noir-render';

export function NoirPanelImage({ image, caption, className = '' }: {
  image: Blob; caption: string; className?: string;
}) {
  const [state, setState] = useState<{ url?: string; error?: string }>({});
  useEffect(() => {
    let disposed = false;
    let url: string | undefined;
    setState({});
    renderNoirPanel(image, caption).then((blob) => {
      if (!disposed) {
        url = URL.createObjectURL(blob);
        setState({ url });
      }
    }).catch((err: unknown) => {
      if (!disposed) setState({ error: err instanceof Error ? err.message : 'Could not render speech balloon.' });
    });
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [image, caption]);
  if (state.error) return <div role="alert" className="bg-white text-red-800 p-4 font-serif">{state.error}</div>;
  if (!state.url) return <div className="bg-zinc-900 text-white p-4">Lettering panel…</div>;
  return <img src={state.url} alt={caption ? `Film Noir panel: ${caption}` : 'Film Noir panel'} className={className} />;
}