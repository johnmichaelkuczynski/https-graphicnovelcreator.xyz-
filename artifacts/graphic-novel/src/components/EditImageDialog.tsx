import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ImagePlus, Loader2, Sparkles, Download, Plus, RotateCcw } from 'lucide-react';
import { editImage } from '@/lib/ai-client';
import { useProjectContext } from '@/lib/project-context';
import { usePanels, useSavePanel } from '@/hooks/use-novel';

const EXAMPLES = [
  'change her maid outfit to a doctor\u2019s uniform',
  'put a man\u2019s head on her body',
  'have her baking cookies in a kitchen',
  'turn her into an octopus but keep the same face',
];

export function EditImageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { currentProjectId } = useProjectContext();
  const { data: panels = [] } = usePanels();
  const savePanel = useSavePanel();

  const [sourceFile, setSourceFile] = useState<Blob | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [strength, setStrength] = useState(0.65);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  // Keep object URLs in sync and revoke them when they change / on unmount.
  useEffect(() => {
    if (!sourceFile) {
      setSourceUrl(null);
      return;
    }
    const url = URL.createObjectURL(sourceFile);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceFile]);

  useEffect(() => {
    if (!resultBlob) {
      setResultUrl(null);
      return;
    }
    const url = URL.createObjectURL(resultBlob);
    setResultUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [resultBlob]);

  const reset = () => {
    setSourceFile(null);
    setPrompt('');
    setStrength(0.65);
    setResultBlob(null);
    setError(null);
    setAdded(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && !busy) reset();
    if (!busy || !next) onOpenChange(next);
  };

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    setSourceFile(file);
    setResultBlob(null);
    setAdded(false);
    setError(null);
  };

  const handleGenerate = async () => {
    if (!sourceFile || !prompt.trim()) return;
    setBusy(true);
    setError(null);
    setResultBlob(null);
    setAdded(false);
    try {
      const out = await editImage(sourceFile, prompt.trim(), strength);
      setResultBlob(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not modify the image.');
    } finally {
      setBusy(false);
    }
  };

  const useResultAsSource = () => {
    if (!resultBlob) return;
    setSourceFile(resultBlob);
    setResultBlob(null);
    setAdded(false);
  };

  const handleAddPanel = async () => {
    if (!resultBlob || !currentProjectId || adding || added) return;
    setAdding(true);
    setError(null);
    try {
      const maxOrder = panels.length > 0 ? Math.max(...panels.map((p) => p.order)) : -1;
      await savePanel.mutateAsync({
        id: crypto.randomUUID(),
        projectId: currentProjectId,
        imageBlob: resultBlob,
        caption: '',
        durationSeconds: 3,
        order: maxOrder + 1,
      });
      setAdded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the panel.');
    } finally {
      setAdding(false);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = 'edited-image.png';
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl border-2 border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-black uppercase tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> Edit a Photo
          </DialogTitle>
          <DialogDescription>
            Upload an image and describe the change in plain words. The AI rebuilds the picture to match.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: source + controls */}
          <div className="space-y-4">
            <div>
              <Label className="font-black uppercase text-xs">Source image</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={pickFile}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="mt-1 w-full aspect-square border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden hover:bg-muted/60 disabled:opacity-50"
              >
                {sourceUrl ? (
                  <img src={sourceUrl} alt="Source" className="w-full h-full object-contain" />
                ) : (
                  <span className="flex flex-col items-center gap-2 text-muted-foreground font-bold">
                    <ImagePlus className="w-8 h-8" />
                    Click to upload
                  </span>
                )}
              </button>
              {sourceUrl && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  className="mt-1 text-xs font-bold underline text-muted-foreground hover:text-foreground"
                >
                  Choose a different image
                </button>
              )}
            </div>

            <div>
              <Label htmlFor="edit-prompt" className="font-black uppercase text-xs">
                How should it change?
              </Label>
              <Textarea
                id="edit-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. change her maid outfit to a doctor's uniform"
                rows={3}
                disabled={busy}
                className="mt-1 border-2 border-border font-medium"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    disabled={busy}
                    onClick={() => setPrompt(ex)}
                    className="text-[11px] font-bold border-2 border-border px-2 py-0.5 bg-card hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="font-black uppercase text-xs">Amount of change</Label>
                <span className="text-xs font-black tabular-nums">{Math.round(strength * 100)}%</span>
              </div>
              <Slider
                min={20}
                max={100}
                step={5}
                value={[Math.round(strength * 100)]}
                onValueChange={(v) => setStrength((v[0] ?? 65) / 100)}
                disabled={busy}
                className="mt-2"
              />
              <p className="mt-1 text-[11px] text-muted-foreground font-medium">
                Lower keeps more of the original (and the face); higher follows your instruction more aggressively.
              </p>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={busy || !sourceFile || !prompt.trim()}
              className="w-full bg-primary text-primary-foreground border-2 border-border brutal-shadow brutal-shadow-hover font-black uppercase tracking-tight disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Working…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" /> {resultBlob ? 'Regenerate' : 'Transform'}
                </>
              )}
            </Button>

            {error && (
              <p className="text-sm font-bold text-destructive border-2 border-destructive bg-destructive/10 p-2">
                {error}
              </p>
            )}
          </div>

          {/* Right: result */}
          <div className="space-y-3">
            <Label className="font-black uppercase text-xs">Result</Label>
            <div className="w-full aspect-square border-2 border-border bg-muted/30 flex items-center justify-center overflow-hidden">
              {busy ? (
                <span className="flex flex-col items-center gap-2 text-muted-foreground font-bold">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  Modifying…
                </span>
              ) : resultUrl ? (
                <img src={resultUrl} alt="Result" className="w-full h-full object-contain" />
              ) : (
                <span className="text-muted-foreground font-bold text-sm px-4 text-center">
                  Your modified image will appear here.
                </span>
              )}
            </div>

            {resultBlob && !busy && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={handleAddPanel}
                  disabled={!currentProjectId || added || adding}
                  className="border-2 border-border font-bold disabled:opacity-60"
                >
                  {adding ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-1" />
                  )}
                  {added ? 'Added' : adding ? 'Adding…' : 'Add as panel'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownload}
                  className="border-2 border-border font-bold"
                >
                  <Download className="w-4 h-4 mr-1" /> Download
                </Button>
                <Button
                  variant="outline"
                  onClick={useResultAsSource}
                  className="col-span-2 border-2 border-border font-bold"
                >
                  <RotateCcw className="w-4 h-4 mr-1" /> Use result as new source
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
