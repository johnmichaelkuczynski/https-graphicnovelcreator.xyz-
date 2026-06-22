import React from 'react';
import { AudioTrack } from '@/lib/db';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { GripVertical, Trash2 } from 'lucide-react';
import { useDeleteAudioTrack } from '@/hooks/use-novel';
import { BlobAudio } from './BlobMedia';

export function AudioTrackItem({ track, index }: { track: AudioTrack; index: number }) {
  const deleteTrack = useDeleteAudioTrack();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: track.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`bg-background border-2 border-border p-3 flex flex-col gap-3 brutal-shadow-sm ${isDragging ? 'opacity-50' : 'hover:-translate-y-0.5 hover:brutal-shadow'} transition-all`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div 
            {...attributes} 
            {...listeners}
            className="cursor-grab active:cursor-grabbing hover:bg-muted p-1 -ml-1 rounded"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </div>
          <span className="text-xs font-mono bg-border text-background px-1.5 py-0.5">
            {index + 1}
          </span>
          <p className="text-sm font-bold truncate" title={track.name}>
            {track.name}
          </p>
        </div>
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mr-1 -mt-1 shrink-0"
          onClick={() => deleteTrack.mutate(track.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
      
      <div className="w-full">
        <BlobAudio 
          blob={track.audioBlob} 
          className="w-full h-8 outline-none"
        />
      </div>
    </div>
  );
}
