import React, { useRef, useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BlobImage } from '@/components/BlobMedia';
import {
  Image as ImageIcon, FileText, ListChecks, Upload, Trash2, ArrowLeft,
  Loader2, Plus, Download,
} from 'lucide-react';
import {
  useLibraryImages, useSaveLibraryImage, useDeleteLibraryImage,
  useLibraryDocuments, useSaveLibraryDocument, useDeleteLibraryDocument,
  useLibraryInstructions, useSaveLibraryInstruction, useDeleteLibraryInstruction,
} from '@/hooks/use-library';
import { extractTextFromFile, ACCEPTED_TEXT_TYPES } from '@/lib/text-extract';


function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Library() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 bg-background border-b-4 border-border px-6 py-4 flex items-center justify-between gap-4 shadow-sm flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-primary border-2 border-border brutal-shadow flex items-center justify-center font-bold text-xl shrink-0">
            GN
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Your Library</h1>
        </div>
        <Link href="/">
          <Button
            variant="outline"
            className="bg-card border-2 border-border brutal-shadow brutal-shadow-hover font-bold"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Studio
          </Button>
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto p-6 max-w-5xl w-full mx-auto">
        <p className="text-muted-foreground font-medium mb-6">
          Everything here is saved permanently in your browser and reusable across
          every project — upload an image, document, or write an instruction once,
          then drop it into any novel whenever you need it.
        </p>

        <Tabs defaultValue="images">
          <TabsList className="border-2 border-border bg-card mb-6">
            <TabsTrigger value="images" className="font-black uppercase text-xs gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ImageIcon className="w-4 h-4" /> Images
            </TabsTrigger>
            <TabsTrigger value="documents" className="font-black uppercase text-xs gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FileText className="w-4 h-4" /> Documents
            </TabsTrigger>
            <TabsTrigger value="instructions" className="font-black uppercase text-xs gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ListChecks className="w-4 h-4" /> Instructions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="images">
            <ImagesTab />
          </TabsContent>
          <TabsContent value="documents">
            <DocumentsTab />
          </TabsContent>
          <TabsContent value="instructions">
            <InstructionsTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground border-4 border-dashed border-border">
      <div className="mb-4 opacity-50">{icon}</div>
      <p className="font-bold">{text}</p>
    </div>
  );
}

function ImagesTab() {
  const { data: images = [], isLoading } = useLibraryImages();
  const saveImage = useSaveLibraryImage();
  const deleteImage = useDeleteLibraryImage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (inputRef.current) inputRef.current.value = '';
    if (files.length === 0) return;
    setBusy(true);
    try {
      for (const file of files) {
        await saveImage.mutateAsync({
          id: crypto.randomUUID(),
          name: file.name,
          imageBlob: file,
          createdAt: Date.now(),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="font-bold text-sm text-muted-foreground">
          {images.length} image{images.length === 1 ? '' : 's'} saved
        </p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="bg-primary text-primary-foreground border-2 border-border brutal-shadow brutal-shadow-hover font-black uppercase tracking-tight"
        >
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          Upload Images
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : images.length === 0 ? (
        <EmptyState icon={<ImageIcon className="w-12 h-12" />} text="No images yet — upload some to reuse them in any project." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {images.map((img) => (
            <div key={img.id} className="border-2 border-border bg-card brutal-shadow flex flex-col">
              <div className="aspect-square bg-muted overflow-hidden border-b-2 border-border">
                <BlobImage blob={img.imageBlob} className="w-full h-full object-cover" alt={img.name} />
              </div>
              <div className="p-2 flex items-center justify-between gap-1">
                <span className="text-xs font-bold truncate" title={img.name}>{img.name}</span>
                <button
                  onClick={() => deleteImage.mutate(img.id)}
                  className="shrink-0 text-destructive hover:bg-destructive/10 p-1 border border-transparent hover:border-destructive"
                  title="Delete from library"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentsTab() {
  const { data: docs = [], isLoading } = useLibraryDocuments();
  const saveDoc = useSaveLibraryDocument();
  const deleteDoc = useDeleteLibraryDocument();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = '';
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        const text = await extractTextFromFile(file);
        if (!text) {
          setError(`No readable text found in "${file.name}".`);
          continue;
        }
        await saveDoc.mutateAsync({
          id: crypto.randomUUID(),
          name: file.name,
          text,
          fileBlob: file,
          createdAt: Date.now(),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="font-bold text-sm text-muted-foreground">
          {docs.length} document{docs.length === 1 ? '' : 's'} saved
        </p>
        <input ref={inputRef} type="file" accept={ACCEPTED_TEXT_TYPES} multiple className="hidden" onChange={handleUpload} />
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="bg-primary text-primary-foreground border-2 border-border brutal-shadow brutal-shadow-hover font-black uppercase tracking-tight"
        >
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          Upload PDF / Word / TXT
        </Button>
      </div>

      {error && (
        <div className="p-3 border-2 border-destructive bg-destructive/10 text-destructive text-sm font-bold">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : docs.length === 0 ? (
        <EmptyState icon={<FileText className="w-12 h-12" />} text="No documents yet — upload source texts you reuse often." />
      ) : (
        <div className="flex flex-col gap-3">
          {docs.map((doc) => (
            <div key={doc.id} className="border-2 border-border bg-card brutal-shadow p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-black truncate" title={doc.name}>{doc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(doc.createdAt)} · {doc.text.length.toLocaleString()} characters
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {doc.fileBlob && (
                    <button
                      onClick={() => downloadBlob(doc.fileBlob!, doc.name)}
                      className="text-foreground hover:bg-accent p-2 border-2 border-border"
                      title="Download original file"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteDoc.mutate(doc.id)}
                    className="text-destructive hover:bg-destructive/10 p-2 border-2 border-border"
                    title="Delete from library"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap">{doc.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InstructionsTab() {
  const { data: instructions = [], isLoading } = useLibraryInstructions();
  const saveInstruction = useSaveLibraryInstruction();
  const deleteInstruction = useDeleteLibraryInstruction();

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  const canSave = title.trim().length > 0 && text.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    await saveInstruction.mutateAsync({
      id: crypto.randomUUID(),
      title: title.trim(),
      text: text.trim(),
      createdAt: Date.now(),
    });
    setTitle('');
    setText('');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="border-2 border-border bg-card brutal-shadow p-4 flex flex-col gap-3">
        <p className="font-black uppercase text-sm">New instruction</p>
        <div className="flex flex-col gap-2">
          <Label className="font-black uppercase text-xs">Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder='e.g. "Spooky kids tale"'
            className="border-2 border-border"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label className="font-black uppercase text-xs">Instruction</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder='The "turn it into…" prompt you reuse, e.g. "A plain-English explainer for kids with a friendly narrator."'
            className="border-2 border-border resize-y"
          />
        </div>
        <Button
          onClick={handleSave}
          disabled={!canSave}
          className="bg-primary text-primary-foreground border-2 border-border brutal-shadow brutal-shadow-hover font-black uppercase tracking-tight self-start disabled:opacity-50"
        >
          <Plus className="w-4 h-4 mr-2" /> Save Instruction
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : instructions.length === 0 ? (
        <EmptyState icon={<ListChecks className="w-12 h-12" />} text="No saved instructions yet — write one above to reuse it in the converter." />
      ) : (
        <div className="flex flex-col gap-3">
          {instructions.map((ins) => (
            <div key={ins.id} className="border-2 border-border bg-card brutal-shadow p-4 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-black truncate" title={ins.title}>{ins.title}</p>
                <p className="text-xs text-muted-foreground mb-1">{formatDate(ins.createdAt)}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ins.text}</p>
              </div>
              <button
                onClick={() => deleteInstruction.mutate(ins.id)}
                className="shrink-0 text-destructive hover:bg-destructive/10 p-2 border-2 border-border"
                title="Delete from library"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
