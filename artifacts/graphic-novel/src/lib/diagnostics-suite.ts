import { generateImage, generateScript } from './ai-client';
import { checkStorage, checkExtraction } from './diagnostics-storage';
import { exportPdf } from './export';
import { validateNoirDialogue, renderNoirPanel } from './noir-render';
import { runDiagnostics } from './diagnostics';
import type { Panel } from './db';
import type { StylePreset } from './style-presets';
import { CARTOON_STYLES, cartoonPrompt } from './cartoon-styles';

export type Status = 'pass' | 'fail' | 'blocked' | 'capability' | 'manual';
export interface Check {
  name: string;
  status: Status;
  evidence: string;
  ms?: number;
}
export interface Report {
  startedAt: string;
  finishedAt?: string;
  checks: Check[];
  verdict: 'incomplete' | 'verified' | 'not fully verified';
}
const imageStyle: StylePreset = { id: 'diagnostic', label: 'Diagnostic', hint: '', prompt: 'Simple illustration', image: { width: 256, height: 256, steps: 2 } };
const source = 'A traveler opens a door. The traveler smiles.';
const explanation = 'Live provider calls consume credits: standard and Venice text and image (four requests), one image edit (30-step provider route), and one short speech request if voices are available. They run immediately after one click, with no second confirmation.';

export const CREDIT_NOTICE = explanation;

function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/https?:\/\/\S+/gi, '[url]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/(?:sk|key|token|bearer)[-_ ][\w.-]{8,}/gi, '[redacted]')
    .replace(/[A-Za-z0-9_+/=-]{48,}/g, '[redacted]').slice(0, 240);
}
function demand(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function pngFixture(): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  demand(ctx, 'Canvas not available in this browser');
  ctx.fillStyle = '#222'; ctx.fillRect(0, 0, 64, 64);
  const blob = await new Promise<Blob | null>(resolve => c.toBlob(resolve, 'image/png'));
  demand(blob?.size, 'PNG encoding unavailable');
  return blob;
}
async function pngValid(blob: Blob): Promise<boolean> {
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  return [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
}
async function request(url: string, signal: AbortSignal, options?: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...options, signal, credentials: 'same-origin' });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
}

export async function runFullDiagnostics(
  controller: AbortController,
  onUpdate: (report: Report, current: string, fraction: number) => void,
): Promise<Report> {
  const signal = controller.signal;
  const report: Report = { startedAt: new Date().toISOString(), checks: [], verdict: 'incomplete' };
  let standardImage: Blob | undefined;
  const tasks: { name: string; run: () => Promise<string>; kind?: Status }[] = [
    { name: 'Photo to Cartoon style validation (local, no provider call)', run: async () => {
      demand(CARTOON_STYLES.length === 14 && new Set(CARTOON_STYLES.map(s => s.id)).size === CARTOON_STYLES.length, 'Cartoon style list missing or duplicate');
      for (const style of CARTOON_STYLES) {
        const prompt = cartoonPrompt(style.id, style.id === 'custom' ? 'pastel drawing' : '');
        demand(prompt.includes('Preserve the recognizable subjects') && prompt.length > 100, `${style.id}: invalid prompt`);
      }
      try { cartoonPrompt('custom'); throw new Error('Empty custom style accepted'); }
      catch (err) { demand(err instanceof Error && err.message === 'Describe your custom cartoon style.', 'Custom style validation failed'); }
      return `Validated ${CARTOON_STYLES.length} presets and custom style requirements locally; no extra provider request.`;
    } },
    { name: 'Project/panel/audio storage and library CRUD', run: () => checkStorage(signal) },
    { name: 'Source upload: TXT and PDF', run: checkExtraction },
    { name: 'Source upload: DOCX', kind: 'manual', run: async () => 'Valid DOCX fixture unavailable; parser exists but this run does not verify it.' },
    { name: 'Image encoding and noir lettering/overflow', run: async () => {
      const image = await pngFixture();
      demand(await pngValid(image), 'Canvas export did not produce PNG bytes');
      demand(validateNoirDialogue('Detective: Hello.') === null, 'Short dialogue rejected');
      demand(validateNoirDialogue('unbreakable'.repeat(200)) !== null, 'Overflow was not rejected');
      const noir = await renderNoirPanel(image, 'Detective: Hello.');
      demand(await pngValid(noir), 'Noir lettering did not produce PNG bytes');
      return `Canvas image ${image.size} bytes; noir lettered PNG ${noir.size} bytes; overflow rejected. Browser download picker not verified.`;
    } },
    { name: 'Standard and noir PDF bytes', run: async () => {
      const image = await pngFixture();
      const panel: Panel = { id: crypto.randomUUID(), projectId: 'in-memory-only', imageBlob: image, caption: 'Detective: Hello.', durationSeconds: 1, order: 0 };
      const normal = await exportPdf([panel], 'diagnostic', undefined, null, false);
      const noir = await exportPdf([panel], 'diagnostic', undefined, { id: 'in-memory-only', name: 'diagnostic', layout: 'film-noir', pageTitle: 'Test', createdAt: 0, updatedAt: 0 }, false);
      const check = async (blob: Blob) => blob.size > 500 && (await blob.slice(0, 5).text()) === '%PDF-';
      demand(await check(normal) && await check(noir), 'PDF signature or size invalid');
      return `Generated actual PDF bytes without download: standard ${normal.size}, noir ${noir.size}. Print/download UI not verified.`;
    } },
    { name: 'Video rendering/decoding, with and without sequence audio', run: async () => {
      if (typeof MediaRecorder === 'undefined' && typeof VideoEncoder === 'undefined') throw new Error('MediaRecorder and WebCodecs unavailable in this browser');
      const cases = await runDiagnostics(undefined, signal, [0, 2]);
      demand(cases.every(c => c.ok), cases.filter(c => !c.ok).map(c => `${c.name}: ${c.steps.filter(s => !s.ok).map(s => s.label).join(', ')}`).join('; '));
      return cases.map(c => `${c.name}: ${c.steps.map(s => s.detail).join('; ')}`).join(' | ').slice(0, 450);
    } },
    { name: 'Video: long mixed-audio export', kind: 'manual', run: async () => '24-panel/96-second mixed export not run automatically due to resource/time cost; panel-attached audio not verified.' },
    { name: 'Current authentication session', run: async () => {
      const auth = await (await request('/api/auth/user', signal)).json();
      demand(auth.authenticated === true, 'No authenticated session');
      return 'Authenticated session present (identity omitted). Login/logout and cross-account boundaries not exercised.';
    } },
    { name: 'AI configuration availability', kind: 'capability', run: async () => {
      const config = await (await request('/api/ai/config', signal)).json();
      demand(typeof config.ready === 'boolean' && typeof config.modes?.standard === 'boolean' && typeof config.modes?.mature === 'boolean', 'Configuration response missing capabilities');
      return `Provider configuration: standard=${config.modes.standard}, Venice=${config.modes.mature}. Key availability only, not provider success.`;
    } },
    { name: 'Admin access boundary (current session only)', kind: 'capability', run: async () => {
      const res = await fetch('/api/admin/visits', { signal, credentials: 'same-origin' });
      demand(res.status === 200 || res.status === 403, `Unexpected admin response HTTP ${res.status}`);
      return res.status === 200 ? 'Current session has admin access; no admin data read or included.' : 'Current session denied admin access (HTTP 403); anonymous/other-user isolation not tested.';
    } },
    ...(['standard', 'mature'] as const).flatMap(mode => [
      { name: `${mode === 'mature' ? 'Venice' : 'Standard'} provider script (live)`, run: async () => {
        const script = await generateScript(source, 'One short illustrated panel', 1, mode, signal);
        demand(script.panels.length === 1 && !!script.panels[0].scene, 'Script was empty');
        return `Live ${mode} text route returned one valid panel; text omitted from report.`;
      } },
      { name: `${mode === 'mature' ? 'Venice' : 'Standard'} provider image (live)`, run: async () => {
        const blob = await generateImage('A simple black circle on white background. No lettering.', imageStyle, 42, mode, signal);
        demand(await pngValid(blob), 'Provider did not return PNG signature');
        if (mode === 'standard') standardImage = blob;
        return `Live ${mode} image route returned PNG (${blob.size} bytes, 256×256 requested).`;
      } },
    ]),
    { name: 'Image editing provider (live)', run: async () => {
      const input = standardImage ?? await pngFixture();
      const res = await request('/api/ai/edit?prompt=Make%20the%20circle%20blue&strength=0.35', signal, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: input });
      const result = await res.blob();
      demand(await pngValid(result), 'Image editor did not return PNG bytes');
      return `Image edit route returned PNG (${result.size} bytes). Visual quality not evaluated.`;
    } },
    { name: 'Speech voices and short live synthesis', run: async () => {
      const data = await (await request('/api/ai/voices', signal)).json();
      demand(Array.isArray(data.voices) && data.voices.length, 'No voices configured');
      const voiceId = data.voices[0]?.voiceId;
      demand(typeof voiceId === 'string', 'Voice ID absent');
      const res = await request('/api/ai/tts', signal, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Test.', voiceId }) });
      const blob = await res.blob();
      demand(blob.size > 100 && blob.type.startsWith('audio/'), 'Speech returned invalid audio');
      return `Voices endpoint and live speech returned audio (${blob.size} bytes); playback not verified.`;
    } },
    { name: 'Other browser/UI boundaries', kind: 'manual', run: async () => 'Sign-in/out, other-user authorization, native download, microphone, drag/drop, player playback and browser permission prompts require manual or separate end-to-end tests.' },
  ];

  for (let i = 0; i < tasks.length; i++) {
    if (signal.aborted) break;
    const task = tasks[i];
    onUpdate({ ...report, checks: [...report.checks] }, task.name, i / tasks.length);
    const started = performance.now();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      // AbortController is shared with fetch. For non-cancellable browser rendering,
      // a timeout stops subsequent checks; in-flight browser work may complete.
      const evidence = await Promise.race([
        task.run(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => controller.abort(new Error('Timed out after 180 seconds')), 180_000);
          onAbort = () => reject(signal.reason instanceof Error ? signal.reason : new Error('Cancelled'));
          signal.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
      report.checks.push({ name: task.name, status: task.kind ?? 'pass', evidence, ms: Math.round(performance.now() - started) });
    } catch (error) {
      const evidence = safeError(error);
      const blocked = signal.aborted || /\bHTTP (401|403|503)\b|unavailable in this browser|not configured/i.test(evidence);
      report.checks.push({ name: task.name, status: blocked ? 'blocked' : 'fail', evidence, ms: Math.round(performance.now() - started) });
      if (signal.aborted) break;
    } finally {
      clearTimeout(timeout);
      if (onAbort) signal.removeEventListener('abort', onAbort);
    }
    onUpdate({ ...report, checks: [...report.checks] }, task.name, (i + 1) / tasks.length);
  }
  if (signal.aborted) report.checks.push({ name: 'Remaining checks', status: 'blocked', evidence: safeError(signal.reason instanceof Error ? signal.reason : new Error('Cancelled before completion')) });
  report.finishedAt = new Date().toISOString();
  report.verdict = report.checks.length === tasks.length && report.checks.every(c => c.status === 'pass') ? 'verified' : 'not fully verified';
  onUpdate({ ...report, checks: [...report.checks] }, 'Done', 1);
  return report;
}