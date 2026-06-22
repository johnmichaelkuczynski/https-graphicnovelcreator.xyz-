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
import { Music } from 'lucide-react';

export function AudioManager({ tracks }: { tracks: AudioTrack[] }) {
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
      <div className="p-4 border-b-4 border-border bg-secondary/20 sticky top-0 z-10 backdrop-blur-sm">
        <h3 className="font-black text-lg uppercase flex items-center gap-2">
          <Music className="w-5 h-5" /> Audio Tracks
        </h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        {tracks.length === 0 ? (
          <div className="text-center p-6 border-2 border-dashed border-border bg-muted/30">
            <p className="text-sm text-muted-foreground font-mono">No audio tracks added.</p>
          </div>
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
