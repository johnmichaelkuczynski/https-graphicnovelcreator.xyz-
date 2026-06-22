import React, { useState } from 'react';
import { AudioTrack } from '@/lib/db';
import { useUpdateAudioTrackOrder } from '@/hooks/use-novel';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { AudioTrackItem } from './AudioTrackItem';
import { Music, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AudioManager({ tracks, onAddAudio }: { tracks: AudioTrack[]; onAddAudio: () => void }) {
  const updateOrder = useUpdateAudioTrackOrder();
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = tracks.findIndex((t) => t.id === active.id);
      const newIndex = tracks.findIndex((t) => t.id === over.id);
      
      const newArray = arrayMove(tracks, oldIndex, newIndex);
      
      const updates = newArray.map((t, idx) => ({ id: t.id, order: idx }));
      updateOrder.mutate(updates);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b-4 border-border bg-secondary/20 sticky top-0 z-10 backdrop-blur-sm flex items-center justify-between gap-2">
        <h3 className="font-black text-lg uppercase flex items-center gap-2">
          <Music className="w-5 h-5" /> Audio Tracks
        </h3>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8 border-2 border-border brutal-shadow brutal-shadow-hover"
          title="Add audio tracks"
          onClick={onAddAudio}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        {tracks.length === 0 ? (
          <button
            type="button"
            onClick={onAddAudio}
            className="w-full text-center p-6 border-2 border-dashed border-border bg-muted/30 hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <Plus className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground font-mono">Click to add audio tracks.</p>
          </button>
        ) : (
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={tracks.map(t => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-3">
                {tracks.map((track, index) => (
                  <AudioTrackItem 
                    key={track.id} 
                    track={track} 
                    index={index} 
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
