import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Wand2, Loader2, Music, AlertTriangle, Upload, Library as LibraryIcon, Save, Check } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { extractTextFromFile, ACCEPTED_TEXT_TYPES } from '@/lib/text-extract';
import { STYLE_PRESETS, getStylePreset } from '@/lib/style-presets';
import { convertTextToNovel, type ConvertProgress, type GeneratedPanel, type GenerationMode } from '@/lib/ai-client';
import { useProjectContext } from '@/lib/project-context';
import {
  useLibraryDocuments, useSaveLibraryDocument,
  useLibraryInstructions, useSaveLibraryInstruction,
} from '@/hooks/use-library';
import { dbApi, type Project } from '@/lib/db';
import { useQueryClient } from '@tanstack/react-query';
import { validateAudioFile, AUDIO_ACCEPT } from '@/lib/audio-validate';
import { toast } from '@/hooks/use-toast';

export function ConvertDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { setCurrentProjectId } = useProjectContext();
  const qc = useQueryClient();

  const { data: libraryDocs = [] } = useLibraryDocuments();
  const saveLibraryDoc = useSaveLibraryDocument();
  const { data: libraryInstructions = [] } = useLibraryInstructions();
  const saveLibraryInstruction = useSaveLibraryInstruction();
  const [savedDoc, setSavedDoc] = useState(false);
  const [savedInstruction, setSavedInstruction] = useState(false);

  const [sourceText, setSourceText] = useState('');
  const [outputSpec, setOutputSpec] = useState('');
  const [styleId, setStyleId] = useState('stick');
  const [pageTitle, setPageTitle] = useState('');
  const [mode, setMode] = useState<GenerationMode>('standard');
  const [customStyle, setCustomStyle] = useState('');
  const [panelCount, setPanelCount] = useState(6);
  const [duration, setDuration] = useState(4);
  const [audioFile, setAudioFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ConvertProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [partialPanels, setPartialPanels] = useState<GeneratedPanel[]>([]);
  const [generationComplete, setGenerationComplete] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [extracting, setExtracting] = useState(false);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  // Credential readiness only; no provider keys or model IDs enter the browser.
  const [readiness, setReadiness] = useState<Record<GenerationMode, boolean> | null>(null);

  const audioRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReadiness(null);
    (async () => {
      try {
        const r = await fetch('/api/ai/config');
        const data = r.ok ? await r.json() : null;
        if (!cancelled) setReadiness({
          standard: !!data?.modes?.standard,
          mature: !!data?.modes?.mature,
        });
      } catch {
        if (!cancelled) setReadiness({ standard: false, mature: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (docRef.current) docRef.current.value = '';
    if (!file) return;
    setExtracting(true);
    setError(null);
    try {
      const text = await extractTextFromFile(file);
      if (!text) {
        setError(`No readable text found in "${file.name}".`);
        return;
      }
      // Append to whatever is already there so an upload never silently wipes
      // text the user already typed/pasted.
      setSourceText((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
      setUploadedName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setExtracting(false);
    }
  };

  const loadLibraryDoc = (id: string) => {
    const doc = libraryDocs.find((d) => d.id === id);
    if (!doc) return;
    setSourceText((prev) => (prev.trim() ? `${prev.trim()}\n\n${doc.text}` : doc.text));
    setUploadedName(doc.name);
  };

  const handleSaveDocToLibrary = async () => {
    if (!sourceText.trim()) return;
    const name = uploadedName || `Source ${new Date().toLocaleDateString()}`;
    await saveLibraryDoc.mutateAsync({
      id: crypto.randomUUID(),
      name,
      text: sourceText.trim(),
      createdAt: Date.now(),
    });
    setSavedDoc(true);
    setTimeout(() => setSavedDoc(false), 2000);
  };

  const loadLibraryInstruction = (id: string) => {
    const ins = libraryInstructions.find((i) => i.id === id);
    if (!ins) return;
    setOutputSpec(ins.text);
  };

  const handleSaveInstructionToLibrary = async () => {
    if (!outputSpec.trim()) return;
    const title = outputSpec.trim().slice(0, 40);
    await saveLibraryInstruction.mutateAsync({
      id: crypto.randomUUID(),
      title,
      text: outputSpec.trim(),
      createdAt: Date.now(),
    });
    setSavedInstruction(true);
    setTimeout(() => setSavedInstruction(false), 2000);
  };

  const style = getStylePreset(styleId);

  const validate = (): string | null => {
    if (!sourceText.trim()) return 'Paste the source text you want to convert.';
    if (sourceText.length > 100_000) return 'The source is too long (100,000 characters maximum). Shorten it before generating.';
    if (styleId === 'custom' && !customStyle.trim()) return 'Describe your custom drawing style.';
    if (panelCount < 1 || panelCount > 24) return 'Choose between 1 and 24 panels.';
    if (!Number.isFinite(duration) || duration < 0.5) return 'Set at least half a second per panel.';
    return null;
  };

  const saveNovel = async (panels: GeneratedPanel[], partial = false) => {
    const name = outputSpec.trim().slice(0, 40) || `Novel ${new Date().toLocaleDateString()}`;
    const project = await dbApi.createGeneratedProject(
      partial ? `${name} (unfinished)` : name,
      panels.map((p) => ({ imageBlob: p.imageBlob, caption: p.caption, durationSeconds: duration })),
      audioFile ? { audioBlob: audioFile, name: audioFile.name } : undefined,
      styleId === 'film-noir' ? { layout: 'film-noir', pageTitle: pageTitle.trim() } : undefined,
    );
    // The transaction above is the success boundary. Seed the selected
    // project's cache before switching so an old list cannot undo selection.
    qc.setQueryData<Project[]>(['projects'], (old = []) => [...old.filter((p) => p.id !== project.id), project]);
    setCurrentProjectId(project.id);
    void Promise.all([
      qc.invalidateQueries({ queryKey: ['projects'] }),
      qc.invalidateQueries({ queryKey: ['panels', project.id] }),
      qc.invalidateQueries({ queryKey: ['audio', project.id] }),
    ]);
    setPartialPanels([]);
    setGenerationComplete(false);
    onOpenChange(false);
    // Keep the source and settings available when reopening the converter,
    // so the same story can be generated again in a different drawing style.
  };

  const handleConvert = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setPartialPanels([]);
    setGenerationComplete(false);
    setBusy(true);
    setProgress({ stage: 'script', current: 0, total: panelCount, message: 'Starting…' });
    const controller = new AbortController();
    abortRef.current = controller;
    const completed: GeneratedPanel[] = [];
    try {
      const panels = await convertTextToNovel({
        mode,
        sourceText,
        outputSpec,
        style,
        customStyle,
        panelCount,
        onProgress: setProgress,
        onPanel: (panel) => completed.push(panel),
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      abortRef.current = null;
      setPartialPanels(panels);
      setGenerationComplete(true);
      setProgress({ stage: 'done', current: panels.length, total: panels.length, message: 'Saving panels to this browser…' });
      await saveNovel(panels);
    } catch (err) {
      setPartialPanels(completed);
      setError(completed.length === panelCount && !controller.signal.aborted
        ? `All panels were generated, but the project could not be saved: ${err instanceof Error ? err.message : 'Unknown storage error'}. Retry saving below; no generation is needed.`
        : controller.signal.aborted
        ? 'Generation cancelled. No project was saved.'
        : err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      abortRef.current = null;
      setBusy(false);
      setProgress(null);
    }
  };

  const handleSavePartial = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveNovel(partialPanels, !generationComplete);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save completed panels.');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (busy) return;
    if (!nextOpen) {
      if (partialPanels.length) {
        setError('Save or download your generated panels before closing, or choose Discard panels explicitly.');
        return;
      }
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl border-4 border-border brutal-shadow max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black uppercase flex items-center gap-2">
            <Wand2 className="w-6 h-6" /> Text → Graphic Novel
          </DialogTitle>
          <DialogDescription className="font-medium">
            Paste a story, dialogue, or screenplay (or upload a document). Choose a drawing style
            and create illustrated panels with captions and dialogue. A new project is saved when finished.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          <fieldset disabled={busy} className="flex flex-col gap-2">
            <legend className="font-black uppercase text-xs mb-2">Story theme</legend>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'standard', label: 'Standard', hint: 'Usual story and illustration generation' },
                { value: 'mature', label: 'Mature themes (Venice)', hint: 'For adult audiences and mature storytelling; not explicit pornography' },
              ] as const).map((option) => (
                <label key={option.value} className={`cursor-pointer p-3 border-2 border-border text-sm ${
                  mode === option.value ? 'bg-primary text-primary-foreground brutal-shadow' : 'bg-card'
                }`}>
                  <input
                    type="radio"
                    name="generation-mode"
                    value={option.value}
                    checked={mode === option.value}
                    onChange={() => setMode(option.value)}
                    className="mr-2"
                  />
                  <span className="font-black">{option.label}</span>
                  <span className="block text-xs mt-1">{option.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {/* Source text */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="font-black uppercase text-xs">Source text</Label>
              <input
                ref={docRef}
                type="file"
                accept={ACCEPTED_TEXT_TYPES}
                className="hidden"
                onChange={handleDocUpload}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-2 border-border font-bold text-xs"
                      disabled={busy}
                    >
                      <LibraryIcon className="w-3 h-3 mr-1" /> From Library
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72 border-2 border-border max-h-64 overflow-y-auto">
                    <DropdownMenuLabel className="font-black uppercase text-xs">Saved documents</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {libraryDocs.length === 0 ? (
                      <div className="px-2 py-3 text-xs text-muted-foreground font-medium">
                        No saved documents yet. Upload one in your Library.
                      </div>
                    ) : (
                      libraryDocs.map((d) => (
                        <DropdownMenuItem
                          key={d.id}
                          onClick={() => loadLibraryDoc(d.id)}
                          className="font-bold cursor-pointer"
                        >
                          <span className="truncate">{d.name}</span>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-2 border-border font-bold text-xs"
                  onClick={handleSaveDocToLibrary}
                  disabled={busy || !sourceText.trim()}
                  title="Save the current source text to your library"
                >
                  {savedDoc ? (
                    <><Check className="w-3 h-3 mr-1" /> Saved</>
                  ) : (
                    <><Save className="w-3 h-3 mr-1" /> Save to Library</>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-2 border-border font-bold text-xs"
                  onClick={() => docRef.current?.click()}
                  disabled={busy || extracting}
                >
                  {extracting ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Reading…</>
                  ) : (
                    <><Upload className="w-3 h-3 mr-1" /> Upload</>
                  )}
                </Button>
              </div>
            </div>
            <Textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={5}
               placeholder="Paste your story, dialogue, or screenplay. Or upload a PDF, Word doc, or TXT file."
              className="border-2 border-border resize-y"
              disabled={busy}
            />
            {uploadedName && (
              <p className="text-xs text-muted-foreground">
                Loaded text from <span className="font-bold">{uploadedName}</span> — edit above if needed.
              </p>
            )}
          </div>

          {/* Output spec */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="font-black uppercase text-xs">Adaptation notes</Label>
              <div className="flex items-center gap-2 flex-wrap">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-2 border-border font-bold text-xs"
                      disabled={busy}
                    >
                      <LibraryIcon className="w-3 h-3 mr-1" /> From Library
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72 border-2 border-border max-h-64 overflow-y-auto">
                    <DropdownMenuLabel className="font-black uppercase text-xs">Saved instructions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {libraryInstructions.length === 0 ? (
                      <div className="px-2 py-3 text-xs text-muted-foreground font-medium">
                        No saved instructions yet. Add one in your Library.
                      </div>
                    ) : (
                      libraryInstructions.map((i) => (
                        <DropdownMenuItem
                          key={i.id}
                          onClick={() => loadLibraryInstruction(i.id)}
                          className="font-bold cursor-pointer"
                        >
                          <span className="truncate">{i.title}</span>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-2 border-border font-bold text-xs"
                  onClick={handleSaveInstructionToLibrary}
                  disabled={busy || !outputSpec.trim()}
                  title="Save this instruction to your library for reuse"
                >
                  {savedInstruction ? (
                    <><Check className="w-3 h-3 mr-1" /> Saved</>
                  ) : (
                    <><Save className="w-3 h-3 mr-1" /> Save to Library</>
                  )}
                </Button>
              </div>
            </div>
            <Textarea
              value={outputSpec}
              onChange={(e) => setOutputSpec(e.target.value)}
              rows={2}
              placeholder='Optional direction, e.g. "Keep the dialogue and make the scenes suspenseful."'
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
            {styleId === 'film-noir' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="noir-title" className="font-black uppercase text-xs">Optional first-page title banner</Label>
                <Input id="noir-title" value={pageTitle} onChange={(e) => setPageTitle(e.target.value)}
                  placeholder="e.g. A Dialogue Concerning OCD" disabled={busy} maxLength={120} />
                <p className="text-xs text-muted-foreground">Dialogue is drawn by the app, not the image model. Four portrait panels make each page; choose more panels if your dialogue is long.</p>
              </div>
            )}
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
              accept={AUDIO_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                if (file) {
                  const problem = validateAudioFile(file);
                  if (problem) {
                    toast({ title: 'Audio not added', description: problem, variant: 'destructive' });
                    e.target.value = '';
                    return;
                  }
                }
                setAudioFile(file);
              }}
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

          {readiness && !readiness[mode] && (
            <div className="flex items-start gap-2 p-3 border-2 border-destructive bg-destructive/10 text-destructive text-sm font-bold">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{mode === 'mature'
                ? 'Mature themes generation is unavailable. Sign in and ensure Venice is configured on the server, then reopen this dialog.'
                : 'Standard generation is unavailable. Sign in and ensure story and image providers are configured on the server, then reopen this dialog.'}</span>
            </div>
          )}

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

          {busy && (
            <Button type="button" variant="outline" onClick={() => abortRef.current?.abort()}
              disabled={!abortRef.current} data-testid="button-cancel-generation">
              Cancel generation
            </Button>
          )}
          {!busy && partialPanels.length > 0 && (
            <div className="flex flex-col gap-2 border-2 border-border p-3">
              <p className="text-sm font-bold">{partialPanels.length} panel{partialPanels.length === 1 ? '' : 's'} generated. {generationComplete ? 'Retry saving the complete project without generating again.' : 'Save these as an unfinished project without generating again.'}</p>
              <Button onClick={handleSavePartial} variant="outline" data-testid="button-save-partial">
                {generationComplete ? 'Retry saving complete project' : `Save ${partialPanels.length} completed panel${partialPanels.length === 1 ? '' : 's'}`}
              </Button>
              <div className="flex flex-wrap gap-2">
                {partialPanels.map((panel, index) => (
                  <Button key={index} size="sm" variant="outline" onClick={() => {
                    const url = URL.createObjectURL(panel.imageBlob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `panel-${index + 1}.${panel.imageBlob.type === 'image/jpeg' ? 'jpg' : 'png'}`;
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 60_000);
                  }}>Download panel {index + 1}</Button>
                ))}
              </div>
              <Button size="sm" variant="ghost" onClick={() => {
                setPartialPanels([]);
                setGenerationComplete(false);
                setError(null);
              }}>Discard generated panels</Button>
            </div>
          )}
          <Button
            onClick={handleConvert}
            disabled={busy || partialPanels.length > 0 || readiness?.[mode] !== true || extracting}
            data-testid="button-generate-novel"
            className="bg-primary text-primary-foreground border-2 border-border brutal-shadow brutal-shadow-hover font-black uppercase tracking-widest text-lg py-6"
          >
            {busy ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Converting…</>
            ) : (
              <><Wand2 className="w-5 h-5 mr-2" /> Create graphic novel</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
