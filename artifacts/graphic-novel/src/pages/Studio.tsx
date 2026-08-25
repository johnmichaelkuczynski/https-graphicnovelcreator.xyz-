import React, { useRef, useState } from 'react';
import { Link } from 'wouter';
import { usePanels, useAudioTracks, useSavePanel, useSaveAudioTrack } from '@/hooks/use-novel';
import { useCreateProject, useClearProject } from '@/hooks/use-projects';
import { useProjectContext } from '@/lib/project-context';
import { PanelGrid } from '@/components/PanelGrid';
import { AudioManager } from '@/components/AudioManager';
import { PreviewPlayer } from '@/components/PreviewPlayer';
import { ConvertDialog } from '@/components/ConvertDialog';
import { EditImageDialog } from '@/components/EditImageDialog';
import { ProjectsDialog } from '@/components/ProjectsDialog';
import { DiagnosticsDialog } from '@/components/DiagnosticsDialog';
import { LibraryImagePicker } from '@/components/LibraryImagePicker';
import { LibraryImage } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Play, Plus, Upload, Music, Image as ImageIcon, FileText, Film,
  FolderPlus, Trash2, ChevronDown, Loader2, LogOut, Wand2, Pencil, Sparkles, Activity,
  Library as LibraryIcon, Shield,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { exportPdf, exportVideo } from '@/lib/export';
import { validateAudioFile, AUDIO_ACCEPT } from '@/lib/audio-validate';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { STORAGE_KEY } from '@/lib/project-context';
import { dbApi } from '@/lib/db';
import { BrandMark } from '@/components/BrandMark';
import { toast } from 'sonner';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Studio() {
  const { projects, currentProjectId, currentProject, setCurrentProjectId, isReady } = useProjectContext();
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Even if the network call fails, still clear local data below.
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('gnc:last-user-id');
    try {
      await dbApi.clearAllData();
    } catch {
      // ignore
    }
    queryClient.clear();
    window.location.href = basePath || '/';
  };

  const { data: panels = [], isLoading: panelsLoading } = usePanels();
  const { data: audioTracks = [] } = useAudioTracks();

  const savePanel = useSavePanel();
  const saveTrack = useSaveAudioTrack();
  const createProject = useCreateProject();
  const clearProject = useClearProject();

  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [showConvert, setShowConvert] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const addImageFiles = async (files: FileList | File[]) => {
    if (!currentProjectId) return;
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) return;

    let maxOrder = panels.length > 0 ? Math.max(...panels.map((p) => p.order)) : -1;
    for (const file of list) {
      maxOrder += 1;
      await savePanel.mutateAsync({
        id: crypto.randomUUID(),
        projectId: currentProjectId,
        imageBlob: file,
        caption: '',
        durationSeconds: 3,
        order: maxOrder,
      });
    }
  };

  const handleBatchImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) await addImageFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const addLibraryImages = async (images: LibraryImage[]) => {
    if (!currentProjectId || images.length === 0) return;
    let maxOrder = panels.length > 0 ? Math.max(...panels.map((p) => p.order)) : -1;
    for (const img of images) {
      maxOrder += 1;
      await savePanel.mutateAsync({
        id: crypto.randomUUID(),
        projectId: currentProjectId,
        imageBlob: img.imageBlob,
        caption: '',
        durationSeconds: 3,
        order: maxOrder,
      });
    }
  };

  const handleBatchAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !currentProjectId) return;

    let maxOrder = audioTracks.length > 0 ? Math.max(...audioTracks.map((t) => t.order)) : -1;
    for (const file of Array.from(files)) {
      const problem = validateAudioFile(file);
      if (problem) {
        toast.error(problem);
        continue;
      }
      maxOrder += 1;
      await saveTrack.mutateAsync({
        id: crypto.randomUUID(),
        projectId: currentProjectId,
        audioBlob: file,
        name: file.name,
        order: maxOrder,
      });
    }
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  const openNewProject = () => {
    setNewProjectName('');
    setShowNewProject(true);
  };

  const handleCreateProject = async () => {
    const name = newProjectName.trim() || `Project ${projects.length + 1}`;
    try {
      const project = await createProject.mutateAsync(name);
      setCurrentProjectId(project.id);
      setShowNewProject(false);
      setNewProjectName('');
    } catch {
      toast.error('Could not create the project. Please try again.');
    }
  };

  const doClearProject = async () => {
    if (!currentProjectId) return;
    await clearProject.mutateAsync(currentProjectId);
    setShowClearConfirm(false);
  };

  const handleExportPdf = async () => {
    if (panels.length === 0) return;
    setExportStatus('Building PDF... 0%');
    try {
      await exportPdf(panels, currentProject?.name ?? 'graphic-novel', (f) => {
        setExportStatus(`Building PDF... ${Math.round(f * 100)}%`);
      });
      toast.success('PDF downloaded.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not build the PDF.');
    } finally {
      setExportStatus(null);
    }
  };

  const handleExportVideo = async () => {
    if (panels.length === 0) return;
    setExportStatus('Rendering video... 0%');
    try {
      await exportVideo(panels, audioTracks, currentProject?.name ?? 'graphic-novel', (f) => {
        setExportStatus(`Rendering video... ${Math.round(f * 100)}%`);
      });
      toast.success('Video downloaded.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not render the video.');
    } finally {
      setExportStatus(null);
    }
  };

  const triggerAddAudio = () => audioInputRef.current?.click();
  const triggerAddImages = () => fileInputRef.current?.click();

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      {isPreviewing && <PreviewPlayer onClose={() => setIsPreviewing(false)} />}

      <ConvertDialog open={showConvert} onOpenChange={setShowConvert} />

      <EditImageDialog open={showEdit} onOpenChange={setShowEdit} />

      <ProjectsDialog open={showProjects} onOpenChange={setShowProjects} />

      <Dialog open={showNewProject} onOpenChange={setShowNewProject}>
        <DialogContent className="max-w-md border-2 border-border">
          <DialogHeader>
            <DialogTitle className="font-black uppercase tracking-tight">New Project</DialogTitle>
            <DialogDescription>Give your project a name so you can tell it apart later.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleCreateProject();
              }
            }}
            placeholder="e.g. The Mountain Saga"
            className="border-2 border-border font-bold"
          />
          <DialogFooter>
            <Button
              variant="outline"
              className="border-2 border-border font-bold"
              onClick={() => setShowNewProject(false)}
            >
              Cancel
            </Button>
            <Button
              className="border-2 border-border font-bold"
              disabled={createProject.isPending}
              onClick={() => void handleCreateProject()}
            >
              {createProject.isPending ? 'Creating…' : 'Create Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DiagnosticsDialog open={showDiagnostics} onOpenChange={setShowDiagnostics} />

      <LibraryImagePicker
        open={showLibraryPicker}
        onOpenChange={setShowLibraryPicker}
        onConfirm={addLibraryImages}
      />

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent className="border-2 border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black uppercase tracking-tight">Clear this project?</AlertDialogTitle>
            <AlertDialogDescription>
              All panels and audio in "{currentProject?.name ?? 'this project'}" will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-2 border-border font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void doClearProject();
              }}
              className="border-2 border-border font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {exportStatus && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-card border-4 border-border brutal-shadow p-8 flex items-center gap-4 font-bold">
            <Loader2 className="w-6 h-6 animate-spin" />
            {exportStatus}
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-background border-b-4 border-border px-6 py-4 flex items-center justify-between gap-4 shadow-sm flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <BrandMark />

          {/* Project Switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="bg-card border-2 border-border brutal-shadow brutal-shadow-hover font-black uppercase tracking-tight max-w-[14rem]"
              >
                <span className="truncate">{currentProject?.name ?? 'Project'}</span>
                <ChevronDown className="w-4 h-4 ml-2 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 border-2 border-border">
              <DropdownMenuItem onClick={openNewProject} className="font-bold cursor-pointer">
                <FolderPlus className="w-4 h-4 mr-2" /> New Project…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowProjects(true)} className="font-bold cursor-pointer">
                <Pencil className="w-4 h-4 mr-2" /> Rename / Delete Projects…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="font-black uppercase text-xs">
                Switch Project ({projects.length})
              </DropdownMenuLabel>
              <div className="max-h-64 overflow-y-auto">
                {projects.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => setCurrentProjectId(p.id)}
                    className={`font-bold cursor-pointer ${p.id === currentProjectId ? 'bg-accent text-accent-foreground' : ''}`}
                  >
                    <span className="truncate">{p.name}</span>
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            className="bg-card border-2 border-border brutal-shadow brutal-shadow-hover font-bold hidden sm:inline-flex"
            onClick={openNewProject}
          >
            <FolderPlus className="w-4 h-4 mr-2" /> New
          </Button>

          <Link href="/library">
            <Button
              variant="outline"
              className="bg-card border-2 border-border brutal-shadow brutal-shadow-hover font-bold"
              title="Your reusable images, documents and instructions"
            >
              <LibraryIcon className="w-4 h-4 mr-2" /> Library
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleBatchImages} />
          <input type="file" multiple accept={AUDIO_ACCEPT} className="hidden" ref={audioInputRef} onChange={handleBatchAudio} />

          <Button
            variant="outline"
            className="bg-card border-2 border-border brutal-shadow brutal-shadow-hover hover:bg-accent hover:text-accent-foreground font-bold"
            onClick={triggerAddAudio}
          >
            <Music className="w-4 h-4 mr-2" /> Add Audio
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="bg-card border-2 border-border brutal-shadow brutal-shadow-hover hover:bg-accent hover:text-accent-foreground font-bold"
              >
                <ImageIcon className="w-4 h-4 mr-2" /> Add Panels
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 border-2 border-border">
              <DropdownMenuItem onClick={triggerAddImages} className="font-bold cursor-pointer">
                <Upload className="w-4 h-4 mr-2" /> Upload from computer
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowLibraryPicker(true)} className="font-bold cursor-pointer">
                <LibraryIcon className="w-4 h-4 mr-2" /> Add from Library
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            className="bg-primary text-primary-foreground border-2 border-border brutal-shadow brutal-shadow-hover hover:bg-primary/90 font-black uppercase tracking-tight"
            onClick={() => setShowConvert(true)}
          >
            <Wand2 className="w-4 h-4 mr-2" /> Convert Text
          </Button>

          <Button
            variant="outline"
            className="bg-secondary text-secondary-foreground border-2 border-border brutal-shadow brutal-shadow-hover hover:bg-secondary/90 font-black uppercase tracking-tight"
            onClick={() => setShowEdit(true)}
          >
            <Sparkles className="w-4 h-4 mr-2" /> Edit Photo
          </Button>

          {/* Export self-test — always enabled; builds its own synthetic novels */}
          <Button
            variant="outline"
            className="bg-card border-2 border-border brutal-shadow brutal-shadow-hover font-bold"
            onClick={() => setShowDiagnostics(true)}
            title="Run an end-to-end self-test of video export"
          >
            <Activity className="w-4 h-4 mr-2" /> Self-Test
          </Button>

          {/* Download menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="bg-card border-2 border-border brutal-shadow brutal-shadow-hover font-bold disabled:opacity-50"
                disabled={panels.length === 0}
              >
                <Upload className="w-4 h-4 mr-2 rotate-180" /> Download
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-2 border-border">
              <DropdownMenuLabel className="font-black uppercase text-xs">Export Novel</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportPdf} className="font-bold cursor-pointer">
                <FileText className="w-4 h-4 mr-2" /> As PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportVideo} className="font-bold cursor-pointer">
                <Film className="w-4 h-4 mr-2" /> As Video
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowClearConfirm(true)} className="font-bold cursor-pointer text-destructive focus:text-destructive">
                <Trash2 className="w-4 h-4 mr-2" /> Clear This Project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowProjects(true)} className="font-bold cursor-pointer text-destructive focus:text-destructive">
                <Trash2 className="w-4 h-4 mr-2" /> Delete Projects…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="w-px h-8 bg-border mx-1"></div>

          <Button
            variant="outline"
            className="bg-secondary text-secondary-foreground border-2 border-border brutal-shadow brutal-shadow-hover font-black uppercase tracking-widest disabled:opacity-50"
            disabled={panels.length === 0}
            onClick={() => setIsPreviewing(true)}
          >
            <Play className="w-4 h-4 mr-2" /> Play
          </Button>

          <div className="w-px h-8 bg-border mx-1"></div>

          {/* Account */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="bg-card border-2 border-border brutal-shadow brutal-shadow-hover font-bold gap-2"
              >
                <span className="w-6 h-6 bg-primary border-2 border-border flex items-center justify-center text-xs font-black uppercase shrink-0">
                  {(user?.displayName?.[0] ?? user?.email?.[0] ?? user?.username?.[0] ?? 'U').toUpperCase()}
                </span>
                <span className="hidden md:inline max-w-[8rem] truncate">
                  {user?.displayName ?? user?.username ?? user?.email ?? 'Account'}
                </span>
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-2 border-border">
              <DropdownMenuLabel className="font-black uppercase text-xs truncate">
                {user?.email ?? user?.username ?? 'Signed in'}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isAdmin && (
                <>
                  <Link href="/admin">
                    <DropdownMenuItem className="font-bold cursor-pointer">
                      <Shield className="w-4 h-4 mr-2" /> Administrative
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={() => void handleLogout()}
                className="font-bold cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="w-4 h-4 mr-2" /> Log Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {/* Storyboard Area (also a drop zone) */}
        <div
          className="flex-1 overflow-y-auto p-8 relative"
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDragging(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files) addImageFiles(e.dataTransfer.files);
          }}
        >
          {isDragging && (
            <div className="absolute inset-4 z-30 border-4 border-dashed border-primary bg-primary/10 flex items-center justify-center pointer-events-none">
              <p className="text-2xl font-black uppercase text-primary">Drop images to add panels</p>
            </div>
          )}

          {panelsLoading ? (
            <div className="flex items-center justify-center h-full">Loading...</div>
          ) : panels.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
              <div className="w-32 h-32 mb-8 rounded-full bg-primary/20 border-4 border-dashed border-primary flex items-center justify-center text-primary">
                <ImageIcon className="w-12 h-12" />
              </div>
              <h2 className="text-3xl font-black mb-4 uppercase">Blank Canvas</h2>
              <p className="text-lg text-muted-foreground mb-8">
                Drag and drop images here, or upload several at once to create your panels.
              </p>
              <Button
                size="lg"
                className="bg-primary text-primary-foreground border-2 border-border brutal-shadow brutal-shadow-hover font-bold text-lg"
                onClick={triggerAddImages}
              >
                <Upload className="w-5 h-5 mr-2" /> Upload Images
              </Button>
            </div>
          ) : (
            <PanelGrid panels={panels} onAddImages={triggerAddImages} />
          )}
        </div>

        {/* Right Sidebar for Audio */}
        <div className="w-80 border-l-4 border-border bg-card overflow-y-auto hidden lg:block shadow-[-4px_0_0_rgba(0,0,0,0.05)]">
          <AudioManager tracks={audioTracks} onAddAudio={triggerAddAudio} />
        </div>
      </main>
    </div>
  );
}
