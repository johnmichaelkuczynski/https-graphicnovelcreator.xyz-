import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NoirPanelImage } from './NoirPanelImage';
import { comicStyles, eligibleComicStyles, newComicReport, runComicStyles, type ComicReport } from '@/lib/all-styles-comic';
import COMIC_SOURCE from '@assets/Pasted-Most-people-including-most-psychologists-operate-on-the_1790625218670.txt?raw';
import { dbApi, type Panel, type Project } from '@/lib/db';
import { exportPdf } from '@/lib/export';
import { useProjectContext } from '@/lib/project-context';
import { useAuth, developmentPreview } from '@/hooks/use-auth';

function ComicImage({ panel, noir }: { panel: Panel; noir: boolean }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (noir) return;
    const next = URL.createObjectURL(panel.imageBlob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [panel.imageBlob, noir]);
  return noir
    ? <NoirPanelImage image={panel.imageBlob} caption={panel.caption} className="w-full aspect-square object-contain bg-black" />
    : <img src={url} alt={panel.caption || 'Comic panel'} className="w-full aspect-square object-contain bg-black" />;
}

export function AllStylesComicDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const { user } = useAuth();
  const { setCurrentProjectId } = useProjectContext();
  const query = useQueryClient();
  const styles = comicStyles();
  const storageKey = `all-styles-comic-v1:${developmentPreview ? 'preview' : `user:${encodeURIComponent(String(user!.id))}`}`;
  const [report, setReport] = useState<ComicReport | null>(null);
  const [panels, setPanels] = useState<Record<string, Panel[]>>({});
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const reportRef = useRef<ComicReport | null>(null);
  const opened = useRef(false);

  const publish = (value: ComicReport) => {
    reportRef.current = value;
    setReport(value);
    try { localStorage.setItem(storageKey, JSON.stringify(value)); }
    catch (e) { setError(`Report could not be stored locally: ${e instanceof Error ? e.message : String(e)}. Saved projects remain in your library.`); }
  };

  const refresh = async (value: ComicReport) => {
    const savedProjects = await dbApi.getProjects();
    setProjects(Object.fromEntries(savedProjects.map(project => [project.id, project])));
    const resultPanels: Record<string, Panel[]> = {};
    for (const item of value.results) {
      if (item.projectId && savedProjects.some(project => project.id === item.projectId)) {
        resultPanels[item.projectId] = await dbApi.getPanels(item.projectId);
      }
    }
    setPanels(resultPanels);
    query.setQueryData(['projects'], savedProjects);
  };

  useEffect(() => {
    if (!open) { opened.current = false; return; }
    if (opened.current) return;
    opened.current = true;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as ComicReport;
        if (!Array.isArray(parsed.results) || typeof parsed.runId !== 'string') throw new Error('Invalid saved report.');
        // An interrupted browser session cannot keep running in the background.
        const interrupted: ComicReport = { ...parsed, results: parsed.results.map(item =>
          item.status === 'running' ? { ...item, status: 'cancelled', error: 'Browser session interrupted; retry this style.' } : item,
        ) };
        publish(interrupted);
        void refresh(interrupted).catch(e => setError(`Could not load saved gallery: ${e instanceof Error ? e.message : String(e)}`));
      } else void start();
    } catch (e) { setError(`Could not read saved comic report: ${e instanceof Error ? e.message : String(e)}`); }
    // The toolbar's explicitly priced click starts once; reopening a saved
    // report only displays it and never silently makes another paid request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, storageKey]);

  const start = async (retry = false) => {
    if (controller.current) return;
    const current = retry ? reportRef.current : newComicReport(styles);
    if (!current) return;
    const selected = eligibleComicStyles(current, styles, retry);
    if (!selected.length) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError('');
    publish(current);
    try {
      await runComicStyles(current, selected, COMIC_SOURCE, abort.signal, (next, style, step) => {
        publish(next);
        setProgress(`${style.label}: ${step?.message ?? next.results.find(r => r.styleId === style.id)?.status ?? ''}`);
        // Read and display the committed project as soon as each style finishes.
        if (next.results.find(r => r.styleId === style.id)?.status === 'passed') {
          void refresh(next).catch(e => setError(`Could not load saved gallery: ${e instanceof Error ? e.message : String(e)}`));
        }
      });
      await refresh(reportRef.current!);
    } catch (e) {
      setError(`Suite stopped unexpectedly: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      controller.current = null;
      setBusy(false);
      setProgress('');
    }
  };

  const download = async (id: string) => {
    setExporting(id);
    setError('');
    try {
      const project = projects[id] ?? (await dbApi.getProjects()).find(p => p.id === id);
      const saved = await dbApi.getPanels(id);
      if (!project || saved.length !== 4) throw new Error('Project or its four saved panels are missing.');
      await exportPdf(saved, project.name, undefined, project);
    } catch (e) { setError(`PDF download failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setExporting(null); }
  };

  return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
    <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto border-2 border-border">
      <DialogHeader>
        <DialogTitle className="font-black uppercase">All Styles Comic Test</DialogTitle>
        <DialogDescription>
          One click generates the attached essay as a real four-panel project in each defined story drawing preset. This is separate from photo cartoon styles and App Diagnostics.
        </DialogDescription>
      </DialogHeader>
      <div className="border-2 border-amber-600 bg-amber-50 text-amber-950 p-3 text-sm" role="note">
        <strong>Paid provider calls:</strong> Start generates {styles.length} scripts and {styles.length * 4} images ({styles.length * 5} requests total, if all succeed). Each style runs sequentially with the standard provider; retries can incur further charges for failed styles. Costs depend on your configured provider and image sizes/steps; no fixed price is guaranteed. Opening this view is free. Existing saved projects are never overwritten.
      </div>
      <p className="text-sm font-medium">Styles ({styles.length}): {styles.map(style => style.label).join(' · ')}. {!styles.some(style => style.id === 'custom') && 'Custom is not applicable: no custom drawing description is defined.'}</p>
      <details className="border-2 border-border p-3 text-sm">
        <summary className="font-bold cursor-pointer">Show exact source essay (read-only)</summary>
        <pre className="whitespace-pre-wrap font-sans mt-3 max-h-64 overflow-y-auto">{COMIC_SOURCE}</pre>
      </details>
      <div className="flex gap-2 flex-wrap">
        {!report && busy && <p className="font-bold">Starting paid generation…</p>}
        {report && !busy && eligibleComicStyles(report, styles, false).length > 0 &&
          <Button onClick={() => void start()} className="font-black">Continue {eligibleComicStyles(report, styles, false).length} pending styles (paid)</Button>}
        {report && !busy && eligibleComicStyles(report, styles, true).length > 0 &&
          <Button variant="outline" onClick={() => void start(true)}>Retry {eligibleComicStyles(report, styles, true).length} failed/cancelled only (paid)</Button>}
        {busy && <Button variant="outline" onClick={() => controller.current?.abort()}>Cancel after current request</Button>}
      </div>
      {progress && <p aria-live="polite" className="text-sm font-bold">{progress}</p>}
      {error && <p role="alert" className="text-sm text-destructive font-bold">{error}</p>}
      {report && <div className="space-y-4" aria-live="polite">
        <p className="text-xs font-mono">Run {report.runId} · {report.results.filter(r => r.status === 'passed').length}/{styles.length} verified saved projects</p>
        {report.results.map(result => {
          const style = styles.find(item => item.id === result.styleId);
          if (!style) return null;
          const project = result.projectId ? projects[result.projectId] : undefined;
          const images = result.projectId ? panels[result.projectId] : undefined;
          return <section key={style.id} className="border-2 border-border p-3 space-y-2">
            <h3 className="font-black">{style.label} — {result.status}</h3>
            {result.error && <p className="text-destructive text-sm">{result.error}</p>}
            {result.projectId && !project && <p className="text-destructive text-sm">Saved project not found in this browser's library.</p>}
            {result.status === 'passed' && project && <>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setCurrentProjectId(project.id); onOpenChange(false); }}>Open project</Button>
                <Button size="sm" variant="outline" disabled={exporting === project.id} onClick={() => void download(project.id)}>Download PDF</Button>
              </div>
              {images?.length === 4 && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {images.map((panel, index) => <div key={panel.id} className="min-w-0">
                  <ComicImage panel={panel} noir={style.id === 'film-noir'} />
                  <p className="text-xs mt-1 break-words">{index + 1}. {panel.caption}</p>
                </div>)}
              </div>}
            </>}
          </section>;
        })}
      </div>}
    </DialogContent>
  </Dialog>;
}