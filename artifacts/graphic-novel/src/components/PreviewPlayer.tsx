import React, { useState, useRef, useEffect } from 'react';
import { usePanels, useAudioTracks } from '@/hooks/use-novel';
import { BlobImage } from './BlobMedia';
import { Button } from '@/components/ui/button';
import { X, Play, Pause, SkipForward } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function PreviewPlayer({ onClose }: { onClose: () => void }) {
  const { data: panels = [] } = usePanels();
  const { data: audioTracks = [] } = useAudioTracks();
  
  const [currentPanelIndex, setCurrentPanelIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const activePanel = panels[currentPanelIndex];
  const activeTrack = audioTracks[currentTrackIndex];

  // Object URLs for audio
  const [trackUrls, setTrackUrls] = useState<string[]>([]);

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
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
      <div className="flex-1 relative flex items-center justify-center p-8">
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
              {activePanel.caption && (
                <div className="mb-8 text-2xl md:text-4xl font-serif text-center max-w-2xl bg-black/50 p-4 rounded border-2 border-white/20">
                  {activePanel.caption}
                </div>
              )}
              <div className="relative w-full max-h-[70vh] flex justify-center">
                <BlobImage 
                  blob={activePanel.imageBlob} 
                  className="max-w-full max-h-full object-contain border-4 border-white brutal-shadow"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="h-24 border-t-2 border-white/20 bg-zinc-900 flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <Button 
            size="icon" 
            variant="outline" 
            className="w-12 h-12 rounded-full border-2 border-white text-white hover:bg-white hover:text-black brutal-shadow brutal-shadow-hover"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
          </Button>
          <div className="text-sm font-mono opacity-50">
            Panel {currentPanelIndex + 1} of {panels.length}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {activeTrack && (
            <div className="text-sm font-mono text-cyan-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              Playing: {activeTrack.name}
            </div>
          )}
          <Button 
            variant="outline" 
            onClick={onClose}
            className="border-2 border-white text-white hover:bg-red-500 hover:text-white hover:border-red-500 brutal-shadow brutal-shadow-hover ml-8"
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
    </div>
  );
}
