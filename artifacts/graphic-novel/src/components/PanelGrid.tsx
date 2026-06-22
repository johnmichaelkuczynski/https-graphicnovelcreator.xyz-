import React, { useState } from 'react';
import { Panel } from '@/lib/db';
import { useUpdatePanelOrder, useSavePanel } from '@/hooks/use-novel';
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
  rectSortingStrategy
} from '@dnd-kit/sortable';
import { PanelItem } from './PanelItem';

export function PanelGrid({ panels }: { panels: Panel[] }) {
  const updateOrder = useUpdatePanelOrder();
  const savePanel = useSavePanel();
  const [activeId, setActiveId] = useState<string | null>(null);

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
    setActiveId(null);
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = panels.findIndex((p) => p.id === active.id);
      const newIndex = panels.findIndex((p) => p.id === over.id);
      
      const newArray = arrayMove(panels, oldIndex, newIndex);
      
      // Update all orders
      const updates = newArray.map((p, idx) => ({ id: p.id, order: idx }));
      updateOrder.mutate(updates);
    }
  };

  const handleInsert = async (index: number, position: 'before' | 'after') => {
    // We'll create a hidden file input to pick the file for insertion
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files[0]) {
        const file = target.files[0];
        
        // We need to re-order existing panels so there is room
        // newArray will have the new element at the target index
        const newArray = [...panels];
        const targetIndex = position === 'before' ? index : index + 1;
        
        const newPanel: Panel = {
          id: crypto.randomUUID(),
          imageBlob: file,
          caption: '',
          durationSeconds: 3,
          order: 0 // Will be overwritten
        };
        
        newArray.splice(targetIndex, 0, newPanel);
        
        // Save the new panel first
        await savePanel.mutateAsync(newPanel);
        
        // Then update everyone's orders
        const updates = newArray.map((p, idx) => ({ id: p.id, order: idx }));
        updateOrder.mutate(updates);
      }
    };
    input.click();
  };

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e) => setActiveId(e.active.id as string)}
      onDragEnd={handleDragEnd}
    >
      <SortableContext 
        items={panels.map(p => p.id)}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8 pb-32">
          {panels.map((panel, index) => (
            <PanelItem 
              key={panel.id} 
              panel={panel} 
              index={index}
              onInsertBefore={() => handleInsert(index, 'before')}
              onInsertAfter={() => handleInsert(index, 'after')}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
