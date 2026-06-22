import React, { useRef, useState } from 'react';
import { usePanels, useAudioTracks, useSavePanel, useSaveAudioTrack } from '@/hooks/use-novel';
import { PanelGrid } from '@/components/PanelGrid';
import { AudioManager } from '@/components/AudioManager';
import { PreviewPlayer } from '@/components/PreviewPlayer';
import { Button } from '@/components/ui/button';
import { Play, Plus, Upload, Music, Image as ImageIcon } from 'lucide-react';
import { dbApi } from '@/lib/db';

export default function Studio() {
  const { data: panels = [], isLoading: panelsLoading } = usePanels();
  const { data: audioTracks = [] } = useAudioTracks();
  
  const savePanel = useSavePanel();
  const saveTrack = useSaveAudioTrack();

  const [isPreviewing, setIsPreviewing] = useState(false);
  const [showAudio, setShowAudio] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const handleBatchImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // get max order
    let maxOrder = 0;
    if (panels.length > 0) {
      maxOrder = Math.max(...panels.map(p => p.order));
    }

    const newPanels = Array.from(files).map((file, index) => ({
      id: crypto.randomUUID(),
      imageBlob: file,
      caption: '',
      durationSeconds: 3,
      order: maxOrder + index + 1
    }));

    // Save one by one
    for (const p of newPanels) {
      await savePanel.mutateAsync(p);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleBatchAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let maxOrder = 0;
    if (audioTracks.length > 0) {
      maxOrder = Math.max(...audioTracks.map(t => t.order));
    }

    const newTracks = Array.from(files).map((file, index) => ({
      id: crypto.randomUUID(),
      audioBlob: file,
      name: file.name,
      order: maxOrder + index + 1
    }));

    for (const t of newTracks) {
      await saveTrack.mutateAsync(t);
    }

    if (audioInputRef.current) audioInputRef.current.value = '';
    setShowAudio(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      {isPreviewing && <PreviewPlayer onClose={() => setIsPreviewing(false)} />}
      
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-background border-b-4 border-border px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-primary border-2 border-border brutal-shadow flex items-center justify-center font-bold text-xl">
            GN
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Graphic Novel Studio</h1>
        </div>

        <div className="flex items-center gap-4">
          <input 
            type="file" 
            multiple 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleBatchImages}
          />
          <input 
            type="file" 
            multiple 
            accept="audio/*" 
            className="hidden" 
            ref={audioInputRef}
            onChange={handleBatchAudio}
          />

          <Button 
            variant="outline" 
            className="bg-card border-2 border-border brutal-shadow brutal-shadow-hover hover:bg-accent hover:text-accent-foreground font-bold"
            onClick={() => audioInputRef.current?.click()}
          >
            <Music className="w-4 h-4 mr-2" /> Add Audio
          </Button>

          <Button 
            variant="outline" 
            className="bg-primary text-primary-foreground border-2 border-border brutal-shadow brutal-shadow-hover hover:bg-primary/90 font-bold"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon className="w-4 h-4 mr-2" /> Add Panels
          </Button>

          <div className="w-px h-8 bg-border mx-2"></div>

          <Button 
            variant="outline" 
            className="bg-secondary text-secondary-foreground border-2 border-border brutal-shadow brutal-shadow-hover font-black uppercase tracking-widest disabled:opacity-50"
            disabled={panels.length === 0}
            onClick={() => setIsPreviewing(true)}
          >
            <Play className="w-4 h-4 mr-2" /> Play
          </Button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {/* Storyboard Area */}
        <div className="flex-1 overflow-y-auto p-8">
          {panelsLoading ? (
            <div className="flex items-center justify-center h-full">Loading...</div>
          ) : panels.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
              <div className="w-32 h-32 mb-8 rounded-full bg-primary/20 border-4 border-dashed border-primary flex items-center justify-center text-primary">
                <ImageIcon className="w-12 h-12" />
              </div>
              <h2 className="text-3xl font-black mb-4 uppercase">Blank Canvas</h2>
              <p className="text-lg text-muted-foreground mb-8">
                Your graphic novel starts here. Upload some images to create your first panels.
              </p>
              <Button 
                size="lg" 
                className="bg-primary text-primary-foreground border-2 border-border brutal-shadow brutal-shadow-hover font-bold text-lg"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-5 h-5 mr-2" /> Upload Images
              </Button>
            </div>
          ) : (
            <PanelGrid panels={panels} />
          )}
        </div>

        {/* Right Sidebar for Audio */}
        <div className="w-80 border-l-4 border-border bg-card overflow-y-auto hidden lg:block shadow-[-4px_0_0_rgba(0,0,0,0.05)]">
          <AudioManager tracks={audioTracks} />
        </div>
      </main>
    </div>
  );
}
