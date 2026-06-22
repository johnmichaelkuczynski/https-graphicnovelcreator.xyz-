import { useMemo, useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useProjectContext } from '@/lib/project-context';
import { useRenameProject, useDeleteProject } from '@/hooks/use-projects';

interface ProjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectsDialog({ open, onOpenChange }: ProjectsDialogProps) {
  const { projects, currentProjectId, setCurrentProjectId } = useProjectContext();
  const renameProject = useRenameProject();
  const deleteProject = useDeleteProject();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const allSelected = projects.length > 0 && selected.size === projects.length;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelected(new Set());
      setEditingId(null);
      setEditingName('');
      setPendingDeleteIds(null);
    }
    onOpenChange(next);
  };

  const pendingNames = useMemo(() => {
    if (!pendingDeleteIds) return [];
    return pendingDeleteIds
      .map((id) => projects.find((p) => p.id === id)?.name)
      .filter((n): n is string => Boolean(n));
  }, [pendingDeleteIds, projects]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === projects.length ? new Set() : new Set(projects.map((p) => p.id))));
  };

  const startRename = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingName('');
  };

  const saveRename = async () => {
    if (!editingId) return;
    const name = editingName.trim();
    if (name) {
      await renameProject.mutateAsync({ id: editingId, name });
    }
    cancelRename();
  };

  const confirmDelete = async () => {
    if (!pendingDeleteIds || pendingDeleteIds.length === 0) return;
    setIsDeleting(true);
    try {
      const remaining = projects.filter((p) => !pendingDeleteIds.includes(p.id));
      for (const id of pendingDeleteIds) {
        await deleteProject.mutateAsync(id);
      }
      if (currentProjectId && pendingDeleteIds.includes(currentProjectId) && remaining.length > 0) {
        setCurrentProjectId(remaining[0].id);
      }
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of pendingDeleteIds) next.delete(id);
        return next;
      });
    } finally {
      setIsDeleting(false);
      setPendingDeleteIds(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg border-2 border-border">
          <DialogHeader>
            <DialogTitle className="font-black uppercase tracking-tight">Manage Projects</DialogTitle>
            <DialogDescription>
              Rename a project, or select several and delete them at once.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between border-2 border-border bg-muted/40 px-3 py-2">
            <label className="flex items-center gap-2 font-bold cursor-pointer">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all projects" />
              <span className="text-sm">
                {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
              </span>
            </label>
            <Button
              variant="outline"
              size="sm"
              disabled={selected.size === 0}
              onClick={() => setPendingDeleteIds([...selected])}
              className="border-2 border-border font-bold text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete Selected
            </Button>
          </div>

          <div className="max-h-[50vh] overflow-y-auto border-2 border-border divide-y-2 divide-border">
            {projects.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No projects yet.</p>
            )}
            {projects.map((p) => {
              const isEditing = editingId === p.id;
              const isCurrent = p.id === currentProjectId;
              return (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={() => toggleOne(p.id)}
                    aria-label={`Select ${p.name}`}
                  />

                  {isEditing ? (
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveRename();
                        if (e.key === 'Escape') cancelRename();
                      }}
                      className="h-8 border-2 border-border font-bold"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCurrentProjectId(p.id)}
                      className="flex-1 min-w-0 text-left font-bold truncate"
                      title={`Switch to ${p.name}`}
                    >
                      <span className="truncate">{p.name}</span>
                      {isCurrent && (
                        <span className="ml-2 text-[10px] font-black uppercase text-primary">Current</span>
                      )}
                    </button>
                  )}

                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void saveRename()}
                        title="Save name"
                        aria-label="Save name"
                        className="shrink-0 p-1.5 border-2 border-border hover:bg-primary hover:text-primary-foreground"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelRename}
                        title="Cancel"
                        aria-label="Cancel rename"
                        className="shrink-0 p-1.5 border-2 border-transparent hover:border-border"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startRename(p.id, p.name)}
                        title="Rename project"
                        aria-label={`Rename ${p.name}`}
                        className="shrink-0 p-1.5 border-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteIds([p.id])}
                        title="Delete project"
                        aria-label={`Delete ${p.name}`}
                        className="shrink-0 p-1.5 border-2 border-transparent text-muted-foreground hover:text-destructive-foreground hover:bg-destructive hover:border-border"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDeleteIds !== null} onOpenChange={(o) => !o && setPendingDeleteIds(null)}>
        <AlertDialogContent className="border-2 border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black uppercase tracking-tight">
              Delete {pendingNames.length > 1 ? `${pendingNames.length} projects` : 'project'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingNames.length === 1
                ? `"${pendingNames[0]}" and everything in it will be permanently deleted. This cannot be undone.`
                : `${pendingNames.length} projects and everything in them will be permanently deleted. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-2 border-border font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={isDeleting}
              className="border-2 border-border font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
