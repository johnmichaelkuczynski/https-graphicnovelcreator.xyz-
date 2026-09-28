import React, { useState, useRef, useEffect, useMemo } from 'react';
import { usePanels, useAudioTracks } from '@/hooks/use-novel';
import { getPanelImages } from '@/lib/db';
import { BlobImage, ImageCollage } from './BlobMedia';
import { Button } from '@/components/ui/button';
import { X, Play, Pause, SkipForward } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectContext } from '@/lib/project-context';
import { NoirPanelImage } from './NoirPanelImage';

export function PreviewPlayer({ onClose }: { onClose: () => void }) {
  const { data: panels = [] } = usePanels();
  const { data: audioTracks = [] } = useAudioTracks();
  const { currentProject } = useProjectContext();
  const isNoir = currentProject?.layout === 'film-noir';
  
  const [currentPanelIndex, setCurrentPanelIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const panelAudioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const activePanel = panels[currentPanelIndex];
  const activeTrack = audioTracks[currentTrackIndex];

  // Stable image list for the active panel so the collage doesn't churn URLs.
  const activeImages = useMemo(
    () => (activePanel ? getPanelImages(activePanel) : []),
    [activePanel?.imageBlob, activePanel?.extraImages],
  );

  // Object URLs for audio
  const [trackUrls, setTrackUrls] = useState<string[]>([]);
  const [panelAudioUrl, setPanelAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    const urls = audioTracks.map(t => URL.createObjectURL(t.audioBlob));
    setTrackUrls(urls);
    return () => {
      urls.forEach(u => URL.revokeObjectURL(u));
    };
  }, [audioTracks]);

  // Handle panel advancing
  useEffect(() => {
    if (isPlaying && activePanel) {
      const durationMs = (activePanel.durationSeconds || 3) * 1000;
      timerRef.current = setTimeout(() => {
        if (currentPanelIndex < panels.length - 1) {
          setCurrentPanelIndex(prev => prev + 1);
        } else {
          // End of panels
          setIsPlaying(false);
        }
      }, durationMs);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, activePanel, currentPanelIndex, panels.length]);

  // Handle audio play/pause
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.error("Audio play failed:", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrackIndex]);

  // Per-panel audio: build an object URL for the active panel's own track.
  useEffect(() => {
    if (!activePanel?.audioBlob) {
      setPanelAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(activePanel.audioBlob);
    setPanelAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [activePanel?.id, activePanel?.audioBlob]);

  // Play the panel's own track (layered over any sequence track) when its
  // panel is on screen.
  useEffect(() => {
    const el = panelAudioRef.current;
    if (!el) return;
    if (isPlaying && panelAudioUrl) {
      el.currentTime = 0;
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [isPlaying, panelAudioUrl, currentPanelIndex]);

  const handleTrackEnded = () => {
    if (currentTrackIndex < audioTracks.length - 1) {
      setCurrentTrackIndex(prev => prev + 1);
    } else {
      // Loop or stop? Let's just stop for now, or loop. We'll loop.
      setCurrentTrackIndex(0);
    }
  };

  if (!panels.length) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold mb-4">No panels to preview</h2>
        <Button onClick={onClose} variant="outline" className="brutal-shadow brutal-shadow-hover">Back to Studio</Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 h-dvh bg-black text-white flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 relative flex items-center justify-center p-3 sm:p-8">
        <AnimatePresence mode="wait">
          {activePanel && (
            <motion.div 
              key={activePanel.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center max-w-4xl w-full h-full justify-center"
            >
               {!isNoir && activePanel.caption && (
                <div className="mb-3 sm:mb-8 text-lg sm:text-2xl md:text-4xl font-serif text-center max-w-2xl max-h-[25vh] overflow-y-auto bg-black/50 p-3 sm:p-4 rounded border-2 border-white/20">
                  {activePanel.caption}
                </div>
              )}
               {isNoir ? (
                 <div className="w-full max-w-[530px] max-h-[75vh] overflow-y-auto bg-white text-black p-1.5">
                   {currentProject?.pageTitle && currentPanelIndex < 4 && (
                     <h2 className="bg-black text-white font-serif font-bold text-center uppercase tracking-wider text-sm sm:text-xl py-1 mb-1.5">
                       {currentProject.pageTitle}
                     </h2>
                   )}
                   <div className="grid grid-cols-2 gap-1.5">
                     {panels.slice(Math.floor(currentPanelIndex / 4) * 4, Math.floor(currentPanelIndex / 4) * 4 + 4).map((p) => (
                       <NoirPanelImage key={p.id} image={p.imageBlob} caption={p.caption} className="w-full aspect-[2/3] object-cover" />
                     ))}
                   </div>
                 </div>
               ) : <div className="relative w-full max-h-[70vh] flex justify-center">
                {activeImages.length <= 1 ? (
                  <BlobImage
                    blob={activePanel.imageBlob}
                    className="max-w-full max-h-full object-contain border-4 border-white brutal-shadow"
                  />
                ) : (
                  <ImageCollage
                    blobs={activeImages}
                    className="w-full max-w-3xl aspect-[4/3] max-h-[70vh] border-4 border-white brutal-shadow"
                  />
                )}
               </div>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="min-h-20 sm:h-24 shrink-0 border-t-2 border-white/20 bg-zinc-900 flex items-center justify-between gap-3 px-3 sm:px-8 py-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <Button 
            size="icon" 
            variant="outline" 
            className="w-12 h-12 rounded-full border-2 border-white text-white hover:bg-white hover:text-black brutal-shadow brutal-shadow-hover"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
          </Button>
          <div className="text-sm font-mono opacity-50">
             {isNoir ? `Page ${Math.floor(currentPanelIndex / 4) + 1} of ${Math.ceil(panels.length / 4)} · Panel ${currentPanelIndex + 1}/${panels.length}` : `Panel ${currentPanelIndex + 1} of ${panels.length}`}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {activeTrack && (
            <div className="hidden sm:flex text-sm font-mono text-cyan-400 items-center gap-2 min-w-0 max-w-64">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="truncate">Playing: {activeTrack.name}</span>
            </div>
          )}
          <Button 
            variant="outline" 
            onClick={onClose}
            className="border-2 border-white text-white hover:bg-red-500 hover:text-white hover:border-red-500 brutal-shadow brutal-shadow-hover sm:ml-8"
          >
            <X className="w-4 h-4 mr-2" /> Exit Preview
          </Button>
        </div>
      </div>

      {trackUrls[currentTrackIndex] && (
        <audio
          ref={audioRef}
          src={trackUrls[currentTrackIndex]}
          onEnded={handleTrackEnded}
          className="hidden"
        />
      )}

      {panelAudioUrl && (
        <audio ref={panelAudioRef} src={panelAudioUrl} className="hidden" />
      )}
    </div>
  );
}
