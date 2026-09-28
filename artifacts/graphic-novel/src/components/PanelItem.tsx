import React, { useState, useRef, useMemo } from 'react';
import { Panel, MAX_PANEL_IMAGES, getPanelImages, LibraryImage } from '@/lib/db';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ImageCollage } from './BlobMedia';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, GripVertical, Image as ImageIcon, Plus, Clock, Download, Music, X, Upload, Library, Sparkles } from 'lucide-react';
import { useSavePanel, useDeletePanel } from '@/hooks/use-novel';
import { Textarea } from '@/components/ui/textarea';
import { validateAudioFile, AUDIO_ACCEPT } from '@/lib/audio-validate';
import { toast } from '@/hooks/use-toast';
import { downloadPanelImage } from '@/lib/export';
import { SpeakControl } from './SpeakControl';
import { LibraryImagePicker } from './LibraryImagePicker';
import { NoirPanelImage } from './NoirPanelImage';
import { useProjectContext } from '@/lib/project-context';
import { downloadBlob } from '@/lib/export';
import { renderNoirPanel } from '@/lib/noir-render';
import { PhotoCartoonDialog } from './PhotoCartoonDialog';

export function PanelItem({ 
  panel, 
  index, 
  onInsertBefore, 
  onInsertAfter 
}: { 
  panel: Panel; 
  index: number;
  onInsertBefore: () => void;
  onInsertAfter: () => void;
}) {
  const savePanel = useSavePanel();
  const { currentProject } = useProjectContext();
  const isNoir = currentProject?.layout === 'film-noir';
  const deletePanel = useDeletePanel();
  
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [caption, setCaption] = useState(panel.caption);
  const [duration, setDuration] = useState(panel.durationSeconds.toString());
  
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [showCartoon, setShowCartoon] = useState(false);
  const [cartoonSourceIndex, setCartoonSourceIndex] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Stable array reference so the collage doesn't rebuild object URLs each render.
  const images = useMemo(
    () => getPanelImages(panel),
    [panel.imageBlob, panel.extraImages],
  );

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: panel.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  const handleSaveCaption = () => {
    savePanel.mutate({ ...panel, caption });
    setIsEditingCaption(false);
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDuration(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      savePanel.mutate({ ...panel, durationSeconds: num });
    }
  };

  const handleReplaceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      savePanel.mutate({ ...panel, imageBlob: e.target.files[0] });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (picked.length) {
      const room = MAX_PANEL_IMAGES - images.length;
      const toAdd = picked.slice(0, Math.max(0, room));
      if (toAdd.length) {
        savePanel.mutate({ ...panel, extraImages: [...(panel.extraImages ?? []), ...toAdd] });
      }
    }
    if (addInputRef.current) addInputRef.current.value = '';
  };

  const handleAddFromLibrary = (picked: LibraryImage[]) => {
    const room = MAX_PANEL_IMAGES - images.length;
    const toAdd = picked.slice(0, Math.max(0, room)).map((img) => img.imageBlob);
    if (toAdd.length) {
      savePanel.mutate({ ...panel, extraImages: [...(panel.extraImages ?? []), ...toAdd] });
    }
  };

  const handleRemoveImage = (idx: number) => {
    if (images.length <= 1) return;
    const next = images.filter((_, i) => i !== idx);
    savePanel.mutate({ ...panel, imageBlob: next[0], extraImages: next.slice(1) });
  };

  const handlePanelAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const problem = validateAudioFile(file);
      if (problem) {
        toast({ title: 'Audio not added', description: problem, variant: 'destructive' });
      } else {
        savePanel.mutate({ ...panel, audioBlob: file, audioName: file.name });
      }
    }
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  const handleRemovePanelAudio = () => {
    savePanel.mutate({ ...panel, audioBlob: undefined, audioName: undefined });
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`relative group bg-card border-4 border-border flex flex-col brutal-shadow ${isDragging ? 'opacity-50' : 'hover:-translate-y-1 hover:shadow-[8px_8px_0_0_hsl(var(--foreground))]'} transition-all duration-200`}
    >
      {/* Insert Before Button - visible on hover */}
      <div className="panel-insert panel-insert-before absolute -left-5 top-1/2 -translate-y-1/2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button 
          size="icon" 
          variant="outline" 
          className="w-8 h-8 rounded-full bg-background border-2 border-border brutal-shadow"
          onClick={onInsertBefore}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      
      {/* Insert After Button - visible on hover */}
      <div className="panel-insert panel-insert-after absolute -right-5 top-1/2 -translate-y-1/2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button 
          size="icon" 
          variant="outline" 
          className="w-8 h-8 rounded-full bg-background border-2 border-border brutal-shadow"
          onClick={onInsertAfter}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 p-2 border-b-4 border-border bg-muted/50">
        <div className="flex items-center gap-2">
          <div 
            {...attributes} 
            {...listeners}
            className="drag-handle cursor-grab active:cursor-grabbing p-1 hover:bg-border/10 rounded touch-none"
            aria-label={`Drag panel ${index + 1} to reorder`}
          >
            <GripVertical className="w-5 h-5 text-muted-foreground" />
          </div>
          <span className="font-bold font-mono bg-background border-2 border-border px-2 py-0.5 brutal-shadow-sm text-sm">
            #{index + 1}
          </span>
        </div>
        
        <div className="panel-actions flex items-center gap-2 max-w-full overflow-x-auto">
          <div className="flex items-center gap-1 bg-background border-2 border-border px-2 py-1 brutal-shadow-sm">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <input 
              type="number" 
              value={duration} 
              onChange={handleDurationChange}
              className="w-10 text-xs font-mono bg-transparent outline-none text-right"
              step="0.5"
              min="0.5"
            />
            <span className="text-xs font-mono text-muted-foreground">s</span>
          </div>
          <input
            type="file"
            accept={AUDIO_ACCEPT}
            className="hidden"
            ref={audioInputRef}
            onChange={handlePanelAudio}
          />
          {panel.audioBlob ? (
            <div className="flex items-center bg-secondary/30 border-2 border-border brutal-shadow-sm">
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-1 max-w-[7rem]"
                title={`Panel sound: ${panel.audioName ?? 'audio'} — click to replace`}
                onClick={() => audioInputRef.current?.click()}
              >
                <Music className="w-3 h-3 shrink-0 text-foreground" />
                <span className="text-[10px] font-mono truncate">{panel.audioName ?? 'sound'}</span>
              </button>
              <button
                type="button"
                className="px-1 py-1 hover:bg-destructive/10 hover:text-destructive border-l-2 border-border"
                title="Remove panel sound"
                onClick={handleRemovePanelAudio}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 hover:bg-accent hover:text-accent-foreground text-muted-foreground"
              title="Add a sound just for this panel"
              onClick={() => audioInputRef.current?.click()}
            >
              <Music className="w-4 h-4" />
            </Button>
          )}
          <SpeakControl panel={panel} />
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-8 w-8 hover:bg-accent hover:text-accent-foreground text-muted-foreground"
            title="Download this panel as an image"
            onClick={() => {
              if (!isNoir) { downloadPanelImage(panel, index); return; }
              renderNoirPanel(panel.imageBlob, panel.caption)
                .then((blob) => downloadBlob(blob, `film-noir-panel-${index + 1}.png`))
                .catch((err: unknown) => toast({ title: 'Cannot download panel', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }));
            }}
          >
            <Download className="w-4 h-4" />
          </Button>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
            onClick={() => deletePanel.mutate(panel.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Caption area */}
      <div className="p-3 border-b-4 border-border bg-accent/5">
        {isEditingCaption ? (
          <div className="flex flex-col gap-2">
            <Textarea 
              value={caption} 
              onChange={e => setCaption(e.target.value)}
              className="font-serif resize-none border-2 border-border brutal-shadow-sm focus-visible:ring-0 focus-visible:ring-offset-0"
              rows={3}
              placeholder="Enter panel caption..."
              autoFocus
              onBlur={handleSaveCaption}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSaveCaption();
                }
              }}
            />
            <p className="text-[10px] text-muted-foreground text-right uppercase font-bold tracking-wider">Press Enter to save</p>
          </div>
        ) : (
          <div 
            onClick={() => setIsEditingCaption(true)}
            className={`font-serif min-h-[3rem] p-2 border-2 border-transparent hover:border-border hover:bg-background cursor-text transition-colors ${!caption ? 'text-muted-foreground italic' : ''}`}
          >
            {caption || "Click to add caption..."}
          </div>
        )}
      </div>

      {/* Image area */}
      {isNoir && images.length > 1 && (
        <div role="status" className="p-2 bg-amber-100 text-amber-950 text-xs">
          Film Noir pages use the first image only; {images.length - 1} additional image(s) remain saved but are not shown in page or video export.
        </div>
      )}
      <div className={`relative ${isNoir ? 'aspect-[2/3]' : 'aspect-[4/3]'} bg-muted overflow-hidden group/img`}>
        {isNoir ? (
          <NoirPanelImage image={panel.imageBlob} caption={panel.caption} className="w-full h-full object-contain bg-black" />
        ) : <ImageCollage
          blobs={images}
          className="w-full h-full"
          onRemove={images.length > 1 ? handleRemoveImage : undefined}
        />}

        <input
          type="file"
          accept="image/*"
          className="hidden"
          ref={fileInputRef}
          onChange={handleReplaceImage}
        />
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          ref={addInputRef}
          onChange={handleAddImages}
        />

        {/* Controls bar — appears on hover */}
        <div className="panel-image-controls absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 p-2 opacity-0 group-hover/img:opacity-100 transition-opacity bg-gradient-to-t from-background/95 via-background/70 to-transparent overflow-x-auto">
          <Button size="sm" variant="outline" className="border-2 border-border bg-background brutal-shadow-sm font-bold" onClick={() => setShowCartoon(true)}>
            <Sparkles className="w-4 h-4 mr-1" /> Photo to Cartoon
          </Button>
          {images.length > 1 && <select aria-label="Choose panel photo to cartoonize" value={cartoonSourceIndex} onChange={e => setCartoonSourceIndex(Number(e.target.value))} className="border-2 border-border bg-background text-xs font-bold p-2">
            {images.map((_, i) => <option key={i} value={i}>Photo {i + 1}</option>)}
          </select>}
          <Button
            size="sm"
            variant="outline"
            className="border-2 border-border bg-background brutal-shadow-sm font-bold"
            onClick={() => fileInputRef.current?.click()}
            title="Replace the first photo"
          >
            <ImageIcon className="w-4 h-4 mr-1" /> Replace
          </Button>
          {!isNoir && images.length < MAX_PANEL_IMAGES && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="border-2 border-border bg-background brutal-shadow-sm font-bold"
                onClick={() => addInputRef.current?.click()}
                title={`Add photos from your computer (up to ${MAX_PANEL_IMAGES})`}
              >
                <Upload className="w-4 h-4 mr-1" /> Add photo ({images.length}/{MAX_PANEL_IMAGES})
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-2 border-border bg-background brutal-shadow-sm font-bold"
                onClick={() => setShowLibraryPicker(true)}
                title="Add photos from your Library"
              >
                <Library className="w-4 h-4 mr-1" /> Library
              </Button>
            </>
          )}
        </div>
      </div>

      <LibraryImagePicker
        open={showLibraryPicker}
        onOpenChange={setShowLibraryPicker}
        onConfirm={handleAddFromLibrary}
        title="Add photos from Library"
        description="Pick saved images to add to this panel."
        confirmLabel={(n) => `Add ${n > 0 ? n : ''} Photo${n === 1 ? '' : 's'}`}
        maxSelect={MAX_PANEL_IMAGES - images.length}
      />
      <PhotoCartoonDialog open={showCartoon} onOpenChange={setShowCartoon} initialSource={images[cartoonSourceIndex] ?? panel.imageBlob} />
    </div>
  );
}
