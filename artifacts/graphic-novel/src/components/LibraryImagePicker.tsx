import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BlobImage } from '@/components/BlobMedia';
import { Check, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useLibraryImages } from '@/hooks/use-library';
import { LibraryImage } from '@/lib/db';

export function LibraryImagePicker({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (images: LibraryImage[]) => void | Promise<void>;
}) {
  const { data: images = [], isLoading } = useLibraryImages();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  // Reset the selection each time the dialog is opened.
  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    const chosen = images.filter((img) => selected.has(img.id));
    if (chosen.length === 0) return;
    setAdding(true);
    try {
      await onConfirm(chosen);
      onOpenChange(false);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !adding && onOpenChange(v)}>
      <DialogContent className="max-w-2xl border-4 border-border brutal-shadow max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black uppercase flex items-center gap-2">
            <ImageIcon className="w-6 h-6" /> Add from Library
          </DialogTitle>
          <DialogDescription className="font-medium">
            Pick saved images to add as panels in this project.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground border-4 border-dashed border-border">
            <ImageIcon className="w-12 h-12 mb-4 opacity-50" />
            <p className="font-bold mb-3">Your image library is empty.</p>
            <Link href="/library">
              <Button
                variant="outline"
                className="border-2 border-border font-bold"
                onClick={() => onOpenChange(false)}
              >
                Go to Library
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 py-2">
            {images.map((img) => {
              const isSel = selected.has(img.id);
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => toggle(img.id)}
                  className={`relative aspect-square border-2 overflow-hidden brutal-shadow transition-all ${
                    isSel ? 'border-primary ring-2 ring-primary' : 'border-border'
                  }`}
                  title={img.name}
                >
                  <BlobImage blob={img.imageBlob} className="w-full h-full object-cover" alt={img.name} />
                  {isSel && (
                    <span className="absolute top-1 right-1 w-6 h-6 bg-primary border-2 border-border flex items-center justify-center text-primary-foreground">
                      <Check className="w-4 h-4" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {images.length > 0 && (
          <DialogFooter>
            <Button
              variant="outline"
              className="border-2 border-border font-bold"
              onClick={() => onOpenChange(false)}
              disabled={adding}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={selected.size === 0 || adding}
              className="bg-primary text-primary-foreground border-2 border-border brutal-shadow brutal-shadow-hover font-black uppercase tracking-tight disabled:opacity-50"
            >
              {adding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Add {selected.size > 0 ? selected.size : ''} Panel{selected.size === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
