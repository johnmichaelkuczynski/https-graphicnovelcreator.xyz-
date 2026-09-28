import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Activity, CheckCircle2, XCircle, Loader2, Download, Square, AlertTriangle } from 'lucide-react';
import { CREDIT_NOTICE, runFullDiagnostics, type Report } from '@/lib/diagnostics-suite';
import { downloadBlob } from '@/lib/export';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DiagnosticsDialog({ open, onOpenChange }: Props) {
  const controller = useRef<AbortController | null>(null);
  const startedForOpen = useRef(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [fraction, setFraction] = useState(0);
  const [report, setReport] = useState<Report | null>(null);

  const run = async () => {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setReport(null);
    setMessage('Starting…');
    setFraction(0);
    try {
      await runFullDiagnostics(abort, (next, current, progress) => {
        setReport(next);
        setMessage(current);
        setFraction(progress);
      });
    } catch {
      setReport(previous => ({
        startedAt: previous?.startedAt ?? new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        verdict: 'not fully verified',
        checks: [...(previous?.checks ?? []), { name: 'Diagnostics harness', status: 'fail', evidence: 'Unexpected harness error; check browser developer tools.' }],
      }));
    } finally {
      controller.current = null;
      setRunning(false);
    }
  };

  useEffect(() => {
    if (open && !startedForOpen.current) {
      startedForOpen.current = true;
      void run();
    }
    if (!open) {
      startedForOpen.current = false;
      controller.current?.abort();
    }
    // Opening from the toolbar is the single action that starts this suite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-2 border-border max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-black uppercase flex items-center gap-2">
            <Activity className="w-5 h-5" /> App Diagnostics
          </DialogTitle>
          <DialogDescription>
            One click runs the inventory below. Tests use isolated local fixtures and clean up only their own records. Existing projects and your selection remain untouched. Results distinguish live checks from manual/unverified coverage; no universal pass is claimed.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm border-2 border-amber-500 bg-amber-50 text-amber-950 p-3 font-medium" role="note">
          <AlertTriangle className="inline w-4 h-4 mr-1" /> {CREDIT_NOTICE}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={run} disabled={running} className="border-2 border-border brutal-shadow brutal-shadow-hover font-black uppercase">
            {running ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running…</> : 'Run Complete Diagnostics'}
          </Button>
          {running && <Button variant="outline" onClick={() => controller.current?.abort()}><Square className="w-4 h-4 mr-2" /> Cancel</Button>}
          {report && <Button variant="outline" onClick={() => downloadBlob(new Blob([JSON.stringify({
            schema: 'app-diagnostics-v1',
            ...report,
            notice: CREDIT_NOTICE,
            scope: 'Current browser and signed-in session only. No private data, provider content, tokens, or user project contents collected.',
          }, null, 2)], { type: 'application/json' }), `diagnostics-${Date.now()}.json`)}>
            <Download className="w-4 h-4 mr-2" /> Download sanitized report
          </Button>}
        </div>
        {running && <div className="space-y-2" aria-live="polite">
          <div className="text-sm font-mono">{message} ({Math.round(fraction * 100)}%)</div>
          <div className="h-2 w-full border-2 border-border bg-card"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round(fraction * 100)}%` }} /></div>
        </div>}
        {report && <div className="space-y-3">
          <div className={`font-black uppercase text-lg ${report.verdict === 'verified' ? 'text-green-600' : 'text-destructive'}`}>
            {running ? 'Checks in progress — not yet verified' : report.verdict === 'verified' ? '✓ All listed checks verified' : 'Not fully verified — see coverage below'}
          </div>
          <p className="text-xs text-muted-foreground">Pass = executed check; Capability = configuration only; Manual = not exercised; Blocked = could not run; Fail = check failed. Timings include browser and provider request time. A pass here is not proof that every app function works.</p>
          <ul className="space-y-2" aria-live="polite">{report.checks.map((check, i) =>
            <li key={`${check.name}-${i}`} className="border-2 border-border p-3">
              <div className="flex gap-2 items-center font-bold">
                {check.status === 'pass' ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" /> : <XCircle className="w-4 h-4 text-destructive shrink-0" />}
                <span>{check.name}</span>
                <span className="ml-auto text-xs uppercase">{check.status}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1 break-words">{check.evidence}{check.ms !== undefined ? ` · ${check.ms} ms` : ''}</div>
            </li>,
          )}</ul>
        </div>}
      </DialogContent>
    </Dialog>
  );
}