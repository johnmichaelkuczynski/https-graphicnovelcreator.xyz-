import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BlobImage } from './BlobMedia';
import { dbApi, type Panel, type PanelGeneration } from '@/lib/db';
import { generateImage, type GenerationMode } from '@/lib/ai-client';
import { getStylePreset, STYLE_PRESETS } from '@/lib/style-presets';
import { useQueryClient } from '@tanstack/react-query';

export function RegeneratePanelDialog({ panel, open, onOpenChange }: {
  panel: Panel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [scene, setScene] = useState(panel.generation?.scene ?? panel.caption);
  const [instructions, setInstructions] = useState('');
  const [styleId, setStyleId] = useState(panel.generation?.styleId ?? 'comic');
  const [customStyle, setCustomStyle] = useState(panel.generation?.styleText ?? '');
  const [mode, setMode] = useState<GenerationMode>(panel.generation?.mode ?? 'standard');
  const [ready, setReady] = useState<Record<GenerationMode, boolean> | null>(null);
  const [preview, setPreview] = useState<{ blob: Blob; generation: PanelGeneration } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setReady(null);
    fetch('/api/ai/config')
      .then(async (r) => {
        if (!r.ok) throw new Error(`Provider availability check failed (${r.status}).`);
        return r.json();
      })
      .then((config) => {
        if (active) setReady({ standard: !!config?.modes?.standard, mature: !!config?.modes?.mature });
      })
      .catch((err) => {
        if (active) {
          setReady({ standard: false, mature: false });
          setError(err instanceof Error ? err.message : 'Could not check image provider availability.');
        }
      });
    return () => { active = false; };
  }, [open]);

  const close = (next: boolean) => {
    if (next) { onOpenChange(true); return; }
    if (saving) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setPreview(null);
    onOpenChange(false);
  };

  const generate = async () => {
    if (busy || saving) return;
    if (!scene.trim()) { setError('Describe the scene you want drawn. You can edit the caption-based suggestion.'); return; }
    if (ready?.[mode] !== true) { setError(`The ${mode} image provider is not available. No other provider will be used automatically.`); return; }
    const style = getStylePreset(styleId);
    const styleText = (styleId === 'custom' ? customStyle
      : styleId === panel.generation?.styleId ? panel.generation.styleText : style.prompt).trim();
    if (!styleText) { setError('Describe a drawing style before generating.'); return; }
    const characterGuide = panel.generation?.characterGuide ?? '';
    const prompt = `${styleText}. ${characterGuide}SCENE: ${scene.trim()}. ${instructions.trim() ? `VISUAL INSTRUCTIONS: ${instructions.trim()}. ` : ''}No lettering, text, speech bubbles or watermarks.`;
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const generation: PanelGeneration = { prompt, scene: scene.trim(), styleId, styleText, mode, seed, characterGuide };
    setError('');
    setNotice('');
    setPreview(null);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const blob = await generateImage(prompt, style, seed, mode, controller.signal);
      if (!controller.signal.aborted) setPreview({ blob, generation });
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not generate an image. The original was kept.');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  };

  const accept = async () => {
    if (!preview || saving) return;
    setSaving(true);
    setError('');
    try {
      await dbApi.replacePanelImage(panel.id, panel.projectId, preview.blob, preview.generation);
      await qc.invalidateQueries({ queryKey: ['panels', panel.projectId] });
      setPreview(null);
      setNotice('Image replaced. You can regenerate this panel again.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the image. The original was kept.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Regenerate panel image</DialogTitle>
          <DialogDescription>Only this panel's first image will change after you approve a preview. Caption, order, audio and other images stay intact. Provider usage limits still apply.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor={`scene-${panel.id}`}>Scene to draw</Label>
          <Textarea id={`scene-${panel.id}`} value={scene} onChange={(e) => { setScene(e.target.value); setPreview(null); }} rows={3} placeholder="Describe a visual scene for this panel" />
          {!panel.generation && <p className="text-xs text-muted-foreground">This older panel has no saved generation prompt. Edit the suggested caption or write a new scene.</p>}
          <Label htmlFor={`visual-${panel.id}`}>Custom visual instructions (optional)</Label>
          <Textarea id={`visual-${panel.id}`} value={instructions} onChange={(e) => { setInstructions(e.target.value); setPreview(null); }} rows={3} placeholder="E.g. change the camera angle, lighting, or background" />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1"><Label htmlFor={`style-${panel.id}`}>Drawing style</Label>
              <select id={`style-${panel.id}`} className="border-2 border-border bg-background p-2" value={styleId} onChange={(e) => { setStyleId(e.target.value); setPreview(null); }}>
                {STYLE_PRESETS.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
              </select>
            </div>
            <div className="grid gap-1"><Label htmlFor={`provider-${panel.id}`}>Image provider / mode</Label>
              <select id={`provider-${panel.id}`} className="border-2 border-border bg-background p-2" value={mode} onChange={(e) => { setMode(e.target.value as GenerationMode); setPreview(null); }}>
                <option value="standard">Standard (Dezgo)</option>
                <option value="mature">Mature themes (Venice)</option>
              </select>
            </div>
          </div>
          {styleId === 'custom' && <><Label htmlFor={`style-text-${panel.id}`}>Custom drawing style</Label>
            <Textarea id={`style-text-${panel.id}`} value={customStyle} onChange={(e) => { setCustomStyle(e.target.value); setPreview(null); }} /></>}
          {ready && !ready[mode] && <p className="text-sm text-destructive" role="status">The selected provider is not configured. Choose another mode explicitly or try later.</p>}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          {notice && <p className="text-sm" role="status">{notice}</p>}
          <Button type="button" disabled={busy || saving || !ready?.[mode]} onClick={generate}>
            {busy ? 'Generating… original image is safe' : preview ? 'Try again with these instructions' : 'Generate preview'}
          </Button>
          {busy && <Button type="button" variant="outline" onClick={() => {
            abortRef.current?.abort();
            abortRef.current = null;
            setBusy(false);
            setError('Generation cancelled. The original image was kept.');
          }}>Cancel generation</Button>}
          {preview && <div className="grid gap-2">
            <p className="text-sm font-bold">Preview — the original is unchanged until you approve this result.</p>
            <BlobImage blob={preview.blob} alt="Generated replacement preview" className="max-h-80 w-full object-contain bg-muted" />
            <Button type="button" disabled={saving} onClick={accept}>{saving ? 'Saving…' : 'Use this image to replace'}</Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setPreview(null)}>Discard preview</Button>
          </div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}