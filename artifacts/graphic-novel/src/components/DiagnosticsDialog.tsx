import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { runDiagnostics, DiagnosticScenarioResult } from '@/lib/diagnostics';
import { Loader2, CheckCircle2, XCircle, Activity } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DiagnosticsDialog({ open, onOpenChange }: Props) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [fraction, setFraction] = useState(0);
  const [results, setResults] = useState<DiagnosticScenarioResult[] | null>(null);

  const run = async () => {
    setRunning(true);
    setResults(null);
    setMessage('Starting…');
    setFraction(0);
    try {
      const r = await runDiagnostics((msg, f) => {
        setMessage(msg);
        setFraction(f);
      });
      setResults(r);
    } catch (e) {
      setResults([
        {
          name: 'Diagnostic harness',
          ok: false,
          steps: [{ label: 'Crashed', ok: false, detail: e instanceof Error ? e.message : String(e) }],
        },
      ]);
    } finally {
      setRunning(false);
    }
  };

  const allPass = results !== null && results.every((r) => r.ok);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-2 border-border max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-black uppercase flex items-center gap-2">
            <Activity className="w-5 h-5" /> Export Self-Test
          </DialogTitle>
          <DialogDescription>
            Synthetically builds several graphic novels (1, 3, 8 and 24 panels, with and without
            audio), renders each one to video, then decodes the result to confirm the duration is
            right and every single panel is present — no freezing, no truncation.
          </DialogDescription>
        </DialogHeader>

        <Button
          onClick={run}
          disabled={running}
          className="border-2 border-border brutal-shadow brutal-shadow-hover font-black uppercase"
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running…
            </>
          ) : (
            'Run Diagnostics'
          )}
        </Button>

        {running && (
          <div className="space-y-2">
            <div className="text-sm font-mono">
              {message} ({Math.round(fraction * 100)}%)
            </div>
            <div className="h-2 w-full border-2 border-border bg-card">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round(fraction * 100)}%` }}
              />
            </div>
          </div>
        )}

        {results && (
          <div className="space-y-3">
            <div
              className={`font-black uppercase text-lg ${
                allPass ? 'text-green-600' : 'text-destructive'
              }`}
            >
              {allPass ? '✓ All tests passed' : '✕ Failures detected'}
            </div>
            {results.map((r, i) => (
              <div key={i} className="border-2 border-border p-3 brutal-shadow">
                <div className="flex items-center gap-2 font-bold">
                  {r.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-destructive shrink-0" />
                  )}
                  {r.name}
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {r.steps.map((s, j) => (
                    <li key={j} className="flex items-start gap-2">
                      {s.ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                      )}
                      <span>
                        <span className="font-medium">{s.label}</span>{' '}
                        <span className="text-muted-foreground">— {s.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
