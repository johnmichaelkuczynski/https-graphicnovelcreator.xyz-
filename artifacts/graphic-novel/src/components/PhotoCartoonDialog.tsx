import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Download, Sparkles } from 'lucide-react';
import { useProjectContext } from '@/lib/project-context';
import { usePanels, useSavePanel } from '@/hooks/use-novel';
import { useLibraryImages, useSaveLibraryImage } from '@/hooks/use-library';
import { editImage } from '@/lib/ai-client';
import { CARTOON_STYLES, cartoonPrompt } from '@/lib/cartoon-styles';
import { downloadBlob } from '@/lib/export';

const ACCEPT = 'image/png,image/jpeg,image/webp';
const MAX_FILE = 12 * 1024 * 1024;

async function validateSource(blob: Blob): Promise<void> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) {
    throw new Error('Choose a PNG, JPEG, or WebP image. Other formats are not supported for cartoon editing.');
  }
  if (!blob.size || blob.size > MAX_FILE) throw new Error('Choose an image smaller than 12 MB.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error('This image could not be decoded. Choose a different PNG, JPEG, or WebP file.');
  }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > 12000 || bitmap.height > 12000) {
      throw new Error('Image dimensions must be between 1 and 12,000 pixels on each side.');
    }
  } finally {
    bitmap.close();
  }
}

export function PhotoCartoonDialog({ open, onOpenChange, initialSource }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSource?: Blob | null;
}) {
  const { currentProjectId } = useProjectContext();
  const { data: panels = [] } = usePanels();
  const { data: images = [] } = useLibraryImages();
  const savePanel = useSavePanel();
  const saveImage = useSaveLibraryImage();
  const [source, setSource] = useState<Blob | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [resultStyle, setResultStyle] = useState('cel');
  const [resultUrl, setResultUrl] = useState('');
  const [style, setStyle] = useState<string>('cel');
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedPanel, setSavedPanel] = useState(false);
  const [savedLibrary, setSavedLibrary] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    if (open) {
      setSource(initialSource ?? null);
      setResult(null);
      setError('');
      setStyle('cel');
      setCustom('');
      setSavedPanel(false);
      setSavedLibrary(false);
    } else {
      generation.current++;
      controller.current?.abort();
      controller.current = null;
      setBusy(false);
    }
  }, [open, initialSource]);

  useEffect(() => {
    if (!source) { setSourceUrl(''); return; }
    const url = URL.createObjectURL(source);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);
  useEffect(() => {
    if (!result) { setResultUrl(''); return; }
    const url = URL.createObjectURL(result);
    setResultUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);

  const selectSource = async (blob: Blob) => {
    setError('');
    try {
      await validateSource(blob);
      setSource(blob);
      setResult(null);
      setSavedPanel(false);
      setSavedLibrary(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this image.');
    }
  };

  const transform = async () => {
    if (!source || busy) return;
    setError('');
    const id = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      const prompt = cartoonPrompt(style, custom);
      await validateSource(source);
      abort.signal.throwIfAborted();
      // The source PNG is sent to the existing server-side image-to-image provider.
      const image = await editImage(source, prompt, 0.55, undefined, abort.signal);
      if (id === generation.current) {
        setResult(image);
        setResultStyle(style);
        setSavedPanel(false);
        setSavedLibrary(false);
      }
    } catch (err) {
      if (id === generation.current && !abort.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Could not cartoonize this image.');
      }
    } finally {
      if (id === generation.current) {
        setBusy(false);
        controller.current = null;
      }
    }
  };

  const save = async (destination: 'panel' | 'library') => {
    if (!result || saving) return;
    setSaving(true);
    setError('');
    try {
      if (destination === 'panel') {
        if (!currentProjectId) throw new Error('Select a project before adding a panel.');
        await savePanel.mutateAsync({
          id: crypto.randomUUID(), projectId: currentProjectId, imageBlob: result,
          caption: '', durationSeconds: 3,
          order: panels.length ? Math.max(...panels.map(p => p.order)) + 1 : 0,
        });
        setSavedPanel(true);
      } else {
        await saveImage.mutateAsync({
          id: crypto.randomUUID(), name: `Cartoon — ${CARTOON_STYLES.find(s => s.id === resultStyle)?.label ?? resultStyle}.png`,
          imageBlob: result, createdAt: Date.now(),
        });
        setSavedLibrary(true);
      }
    } catch (err) {
      // Keep the generated image available for retry or download.
      setError(err instanceof Error ? err.message : 'Could not save the cartoon. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-2 border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-black uppercase flex items-center gap-2"><Sparkles className="w-5 h-5" /> Photo to Cartoon</DialogTitle>
          <DialogDescription>
            Turn a photo into an illustration using the image-edit provider. The original stays unchanged.
            PNG, JPEG or WebP, up to 12 MB; images are scaled to at most 1024 px for editing.
            Results depend on provider availability and content restrictions; subject fidelity is not guaranteed.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-3">
            <Label>Before · source photo</Label>
            <div className="aspect-square border-2 border-border bg-muted/30 flex items-center justify-center">
              {sourceUrl ? <img src={sourceUrl} alt="Original source photo" className="max-w-full max-h-full object-contain" /> : <span className="text-sm text-muted-foreground">Select a photo below</span>}
            </div>
            <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void selectSource(file);
            }} />
            <Button variant="outline" disabled={busy || saving} onClick={() => input.current?.click()}>Upload photo</Button>
            {images.length > 0 && (
              <div>
                <Label htmlFor="cartoon-library">Or use a Library image</Label>
                <select id="cartoon-library" value="" disabled={busy || saving} onChange={e => {
                  const selected = images.find(image => image.id === e.target.value);
                  if (selected) void selectSource(selected.imageBlob);
                }} className="w-full mt-1 border-2 border-border bg-background p-2 text-sm">
                  <option value="">Choose from Library…</option>
                  {images.map(image => <option key={image.id} value={image.id}>{image.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <Label htmlFor="cartoon-style">Cartoon style</Label>
              <select id="cartoon-style" value={style} disabled={busy} onChange={e => setStyle(e.target.value)} className="w-full mt-1 border-2 border-border bg-background p-2">
                {CARTOON_STYLES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </div>
            {style === 'custom' && <div><Label htmlFor="cartoon-custom">Describe the drawing style</Label><Textarea id="cartoon-custom" value={custom} onChange={e => setCustom(e.target.value)} maxLength={500} disabled={busy} placeholder="e.g. soft pastel line art" /></div>}
            <Button onClick={() => void transform()} disabled={!source || busy || saving || (style === 'custom' && !custom.trim())} className="w-full font-black">
              {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Cartoonizing…</> : <><Sparkles className="w-4 h-4 mr-2" /> {result ? 'Try another version' : 'Create cartoon'}</>}
            </Button>
            {busy && <Button variant="outline" onClick={() => { generation.current++; controller.current?.abort(); controller.current = null; setBusy(false); }}>Cancel edit</Button>}
            {error && <p role="alert" className="text-sm text-destructive border-2 border-destructive p-2">{error}</p>}
          </div>
          <div className="space-y-3">
            <Label>After · cartoon preview</Label>
            <div className="aspect-square border-2 border-border bg-muted/30 flex items-center justify-center">
              {resultUrl ? <img src={resultUrl} alt="Generated cartoon result" className="max-w-full max-h-full object-contain" /> : <span className="text-sm text-muted-foreground text-center px-4">Your edited cartoon appears here.</span>}
            </div>
            {result && <div className="flex flex-wrap gap-2">
              <Button disabled={saving || savedPanel || !currentProjectId} onClick={() => void save('panel')}>{savedPanel ? 'Added to project' : 'Save as new panel'}</Button>
              <Button variant="outline" disabled={saving || savedLibrary} onClick={() => void save('library')}>{savedLibrary ? 'Saved to Library' : 'Save to Library'}</Button>
              <Button variant="outline" onClick={() => downloadBlob(result, 'photo-cartoon.png')}><Download className="w-4 h-4 mr-1" /> Download PNG</Button>
            </div>}
            {saving && <p role="status" className="text-sm"><Loader2 className="inline w-4 h-4 animate-spin" /> Saving…</p>}
            <p className="text-xs text-muted-foreground">Save creates a new copy. No existing panel or Library image is replaced.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}