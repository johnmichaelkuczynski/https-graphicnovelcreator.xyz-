import React, { useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/ui/accordion';
import { Wand2, Loader2, Settings, Music, KeyRound, AlertTriangle } from 'lucide-react';
import { STYLE_PRESETS, getStylePreset } from '@/lib/style-presets';
import {
  AiSettings, loadAiSettings, saveAiSettings, PROVIDER_PRESETS,
} from '@/lib/ai-settings';
import { convertTextToNovel, ConvertProgress } from '@/lib/ai-client';
import { useProjectContext } from '@/lib/project-context';
import { useCreateProject } from '@/hooks/use-projects';
import { dbApi } from '@/lib/db';
import { useQueryClient } from '@tanstack/react-query';

export function ConvertDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { setCurrentProjectId } = useProjectContext();
  const createProject = useCreateProject();
  const qc = useQueryClient();

  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [sourceText, setSourceText] = useState('');
  const [outputSpec, setOutputSpec] = useState('');
  const [styleId, setStyleId] = useState('stick');
  const [customStyle, setCustomStyle] = useState('');
  const [panelCount, setPanelCount] = useState(6);
  const [duration, setDuration] = useState(4);
  const [audioFile, setAudioFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ConvertProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLInputElement>(null);

  const updateSettings = (patch: Partial<AiSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveAiSettings(next);
      return next;
    });
  };

  const applyProvider = (id: string) => {
    const p = PROVIDER_PRESETS.find((x) => x.id === id);
    if (!p) return;
    updateSettings({ baseUrl: p.baseUrl, chatModel: p.chatModel, imageModel: p.imageModel });
  };

  const style = getStylePreset(styleId);

  const validate = (): string | null => {
    if (!settings.apiKey.trim()) return 'Add your API key in AI Provider settings below.';
    if (!sourceText.trim()) return 'Paste the source text you want to convert.';
    if (!outputSpec.trim()) return 'Describe what the output should be.';
    if (styleId === 'custom' && !customStyle.trim()) return 'Describe your custom drawing style.';
    if (panelCount < 1 || panelCount > 24) return 'Choose between 1 and 24 panels.';
    return null;
  };

  const handleConvert = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setBusy(true);
    setProgress({ stage: 'script', current: 0, total: panelCount, message: 'Starting…' });
    try {
      const panels = await convertTextToNovel({
        settings,
        sourceText,
        outputSpec,
        style,
        customStyle,
        panelCount,
        onProgress: setProgress,
      });

      const name =
        outputSpec.trim().slice(0, 40) || `Novel ${new Date().toLocaleDateString()}`;
      const project = await createProject.mutateAsync(name);

      const sharedAudio = audioFile
        ? { blob: audioFile, name: audioFile.name }
        : null;

      for (let i = 0; i < panels.length; i++) {
        await dbApi.savePanel({
          id: crypto.randomUUID(),
          projectId: project.id,
          imageBlob: panels[i].imageBlob,
          caption: panels[i].caption,
          durationSeconds: duration,
          order: i,
        });
      }
      if (sharedAudio) {
        await dbApi.saveAudioTrack({
          id: crypto.randomUUID(),
          projectId: project.id,
          audioBlob: sharedAudio.blob,
          name: sharedAudio.name,
          order: 0,
        });
      }

      qc.invalidateQueries({ queryKey: ['panels'] });
      qc.invalidateQueries({ queryKey: ['audio'] });
      setCurrentProjectId(project.id);
      onOpenChange(false);
      // reset volatile inputs but keep settings + last choices
      setSourceText('');
      setOutputSpec('');
      setAudioFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-2xl border-4 border-border brutal-shadow max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black uppercase flex items-center gap-2">
            <Wand2 className="w-6 h-6" /> Text → Graphic Novel
          </DialogTitle>
          <DialogDescription className="font-medium">
            Paste any text, say what it should become, pick a drawing style, and convert.
            Uses your own AI provider key.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* Source text */}
          <div className="flex flex-col gap-2">
            <Label className="font-black uppercase text-xs">Source text</Label>
            <Textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={5}
              placeholder="Paste an essay, article, proof, notes — anything."
              className="border-2 border-border resize-y"
              disabled={busy}
            />
          </div>

          {/* Output spec */}
          <div className="flex flex-col gap-2">
            <Label className="font-black uppercase text-xs">Turn it into…</Label>
            <Textarea
              value={outputSpec}
              onChange={(e) => setOutputSpec(e.target.value)}
              rows={2}
              placeholder='e.g. "A spooky haunted-house tale with a man, a woman and a talking cat" or "A plain-English explainer for kids".'
              className="border-2 border-border resize-y"
              disabled={busy}
            />
          </div>

          {/* Style */}
          <div className="flex flex-col gap-2">
            <Label className="font-black uppercase text-xs">Drawing style (same for every panel)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {STYLE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => setStyleId(p.id)}
                  className={`text-left p-2 border-2 border-border text-xs font-bold transition-all ${
                    styleId === p.id
                      ? 'bg-primary text-primary-foreground brutal-shadow'
                      : 'bg-card hover:bg-accent'
                  }`}
                  title={p.hint}
                >
                  {p.label}
                  {p.tokenLight && (
                    <span className="block text-[10px] font-mono opacity-80">cheapest</span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{style.hint}</p>
            {styleId === 'custom' && (
              <Textarea
                value={customStyle}
                onChange={(e) => setCustomStyle(e.target.value)}
                rows={2}
                placeholder="Describe exactly how every panel should be drawn (medium, line, color, mood)."
                className="border-2 border-border resize-y"
                disabled={busy}
              />
            )}
          </div>

          {/* Panels + duration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label className="font-black uppercase text-xs">Number of panels</Label>
              <Input
                type="number"
                min={1}
                max={24}
                value={panelCount}
                onChange={(e) => setPanelCount(parseInt(e.target.value) || 1)}
                className="border-2 border-border"
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="font-black uppercase text-xs">Seconds per panel</Label>
              <Input
                type="number"
                min={0.5}
                step={0.5}
                value={duration}
                onChange={(e) => setDuration(parseFloat(e.target.value) || 1)}
                className="border-2 border-border"
                disabled={busy}
              />
            </div>
          </div>

          {/* Optional audio */}
          <div className="flex flex-col gap-2">
            <Label className="font-black uppercase text-xs">Music / narration (optional)</Label>
            <input
              ref={audioRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              className="border-2 border-border brutal-shadow brutal-shadow-hover font-bold justify-start"
              onClick={() => audioRef.current?.click()}
              disabled={busy}
            >
              <Music className="w-4 h-4 mr-2" />
              {audioFile ? audioFile.name : 'Add a track for the whole sequence'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Optional. You can also add per-panel sounds later in the studio.
            </p>
          </div>

          {/* AI provider settings */}
          <Accordion type="single" collapsible defaultValue={settings.apiKey ? undefined : 'ai'}>
            <AccordionItem value="ai" className="border-2 border-border">
              <AccordionTrigger className="px-3 font-black uppercase text-xs">
                <span className="flex items-center gap-2">
                  <Settings className="w-4 h-4" /> AI Provider {settings.apiKey ? '✓' : '— add key'}
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-3 flex flex-col gap-3">
                <div className="flex gap-2 flex-wrap">
                  {PROVIDER_PRESETS.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-2 border-border font-bold text-xs"
                      onClick={() => applyProvider(p.id)}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs font-bold flex items-center gap-1">
                    <KeyRound className="w-3 h-3" /> API key
                  </Label>
                  <Input
                    type="password"
                    value={settings.apiKey}
                    onChange={(e) => updateSettings({ apiKey: e.target.value })}
                    placeholder="Paste your provider API key"
                    className="border-2 border-border font-mono text-sm"
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs font-bold">Base URL</Label>
                  <Input
                    value={settings.baseUrl}
                    onChange={(e) => updateSettings({ baseUrl: e.target.value })}
                    className="border-2 border-border font-mono text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs font-bold">Text model</Label>
                    <Input
                      value={settings.chatModel}
                      onChange={(e) => updateSettings({ chatModel: e.target.value })}
                      className="border-2 border-border font-mono text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs font-bold">Image model</Label>
                    <Input
                      value={settings.imageModel}
                      onChange={(e) => updateSettings({ imageModel: e.target.value })}
                      className="border-2 border-border font-mono text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your key is stored only in this browser and sent straight to your provider.
                  Model names are editable if a default is out of date.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {error && (
            <div className="flex items-start gap-2 p-3 border-2 border-destructive bg-destructive/10 text-destructive text-sm font-bold">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {busy && progress && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> {progress.message}
              </div>
              {progress.stage === 'image' && (
                <div className="h-3 border-2 border-border bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}

          <Button
            onClick={handleConvert}
            disabled={busy}
            className="bg-primary text-primary-foreground border-2 border-border brutal-shadow brutal-shadow-hover font-black uppercase tracking-widest text-lg py-6"
          >
            {busy ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Converting…</>
            ) : (
              <><Wand2 className="w-5 h-5 mr-2" /> Convert</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
