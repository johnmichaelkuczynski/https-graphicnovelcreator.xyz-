import { Panel, AudioTrack } from './db';
import { renderVideoBlob, totalDurationSec } from './export';

export interface DiagnosticStep {
  label: string;
  ok: boolean;
  detail: string;
}

export interface DiagnosticScenarioResult {
  name: string;
  ok: boolean;
  steps: DiagnosticStep[];
}

const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#a3e635',
  '#f43f5e', '#0ea5e9', '#7c3aed', '#10b981', '#f59e0b',
];

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

// A distinct, easily-recognised panel image: a unique background colour plus a
// big index number. Distinct colours let the verifier detect a frozen frame.
async function makePanelImage(index: number, label: string): Promise<Blob> {
  const W = 640;
  const H = 480;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = PALETTE[index % PALETTE.length];
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 90 + (index % 5) * 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 180px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index + 1), W / 2, H / 2);
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(label.slice(0, 26), W / 2, H - 44);
  return canvasToPngBlob(c);
}

// A short sine-tone WAV so audio mixing/encoding is exercised without any files.
function makeToneWav(seconds: number, freq: number): Blob {
  const sampleRate = 44100;
  const n = Math.max(1, Math.floor(seconds * sampleRate));
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.sin(2 * Math.PI * freq * (i / sampleRate)) * 0.3;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

async function buildPanels(
  count: number,
  durationSec: number,
  conceit: string,
  withPanelAudio: boolean,
): Promise<Panel[]> {
  const panels: Panel[] = [];
  for (let i = 0; i < count; i++) {
    const panel: Panel = {
      id: crypto.randomUUID(),
      projectId: 'diagnostic',
      imageBlob: await makePanelImage(i, conceit),
      caption: `${conceit} — panel ${i + 1}`,
      durationSeconds: durationSec,
      order: i,
    };
    if (withPanelAudio && i % 3 === 0) {
      panel.audioBlob = makeToneWav(Math.min(durationSec, 1), 330 + i * 40);
      panel.audioName = `tone-${i}.wav`;
    }
    panels.push(panel);
  }
  return panels;
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
      clearTimeout(timer);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('seek error'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('seek timeout'));
    }, 6000);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onErr);
    video.currentTime = t;
  });
}

function avgRGB(data: Uint8ClampedArray): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  const px = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return [r / px, g / px, b / px];
}

function colorDist(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

// Decode the produced video and prove (a) it has the right duration and (b) the
// frame at each panel's midpoint differs from the previous one — i.e. nothing is
// frozen and every panel actually made it into the file.
async function verify(blob: Blob, panels: Panel[]): Promise<DiagnosticStep[]> {
  const steps: DiagnosticStep[] = [];
  const expectedSec = totalDurationSec(panels);

  steps.push({
    label: 'Produced a video file',
    ok: blob.size > 1000,
    detail: `${(blob.size / 1024).toFixed(0)} KB`,
  });
  if (blob.size <= 1000) return steps;

  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('decode failed'));
      setTimeout(() => reject(new Error('metadata timeout')), 10000);
    });

    let dur = video.duration;
    if (!isFinite(dur) || dur === 0) {
      await seekTo(video, 1e7).catch(() => {});
      dur = video.duration;
    }
    const tolerance = Math.max(0.7, expectedSec * 0.12);
    const durOk = isFinite(dur) && Math.abs(dur - expectedSec) <= tolerance;
    steps.push({
      label: 'Duration matches the panels',
      ok: durOk,
      detail: `got ${isFinite(dur) ? dur.toFixed(2) : 'invalid'}s, expected ~${expectedSec.toFixed(2)}s`,
    });

    const probeDur = isFinite(dur) && dur > 0 ? dur : expectedSec;
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    const sigs: [number, number, number][] = [];
    let acc = 0;
    let sampled = 0;
    for (let i = 0; i < panels.length; i++) {
      const d = Math.max(0.5, panels[i].durationSeconds);
      const mid = acc + d / 2;
      acc += d;
      const t = Math.max(0, Math.min(mid, probeDur - 0.03));
      try {
        await seekTo(video, t);
        ctx.drawImage(video, 0, 0, 32, 32);
        sigs.push(avgRGB(ctx.getImageData(0, 0, 32, 32).data));
        sampled++;
      } catch {
        sigs.push([-1, -1, -1]);
      }
    }
    steps.push({
      label: 'Read a frame from every panel',
      ok: sampled === panels.length,
      detail: `${sampled}/${panels.length} panels sampled`,
    });

    if (panels.length > 1) {
      let frozen = 0;
      for (let i = 1; i < sigs.length; i++) {
        if (colorDist(sigs[i], sigs[i - 1]) < 12) frozen++;
      }
      steps.push({
        label: 'Every panel is distinct (no freeze)',
        ok: frozen === 0,
        detail:
          frozen === 0
            ? `all ${sigs.length} panels changed`
            : `${frozen} panel(s) identical to the previous frame — frozen/dropped`,
      });
    }
  } catch (e) {
    steps.push({
      label: 'Decode the produced video',
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
  return steps;
}

interface Scenario {
  name: string;
  count: number;
  dur: number;
  conceit: string;
  audio: 'none' | 'sequence' | 'mixed';
}

const SCENARIOS: Scenario[] = [
  { name: 'Tiny — 1 panel @ 1s, no audio', count: 1, dur: 1, conceit: 'Single Frame', audio: 'none' },
  { name: 'Short — 3 panels @ 2s, no audio', count: 3, dur: 2, conceit: 'The Hero’s Journey', audio: 'none' },
  { name: 'Medium — 8 panels @ 3s, sequence audio', count: 8, dur: 3, conceit: 'A Cat’s Tale', audio: 'sequence' },
  { name: 'Long — 24 panels @ 4s, mixed audio', count: 24, dur: 4, conceit: 'Noir Detective', audio: 'mixed' },
];

export async function runDiagnostics(
  onProgress?: (message: string, fraction: number) => void,
): Promise<DiagnosticScenarioResult[]> {
  const results: DiagnosticScenarioResult[] = [];
  for (let s = 0; s < SCENARIOS.length; s++) {
    const sc = SCENARIOS[s];
    const base = s / SCENARIOS.length;
    const span = 1 / SCENARIOS.length;
    const steps: DiagnosticStep[] = [];
    try {
      onProgress?.(`Building "${sc.name}"…`, base);
      const panels = await buildPanels(sc.count, sc.dur, sc.conceit, sc.audio === 'mixed');
      const tracks: AudioTrack[] = [];
      if (sc.audio === 'sequence' || sc.audio === 'mixed') {
        tracks.push({
          id: crypto.randomUUID(),
          projectId: 'diagnostic',
          name: 'soundtrack.wav',
          order: 0,
          audioBlob: makeToneWav(Math.min(sc.count * sc.dur, 6), 220),
        });
      }

      onProgress?.(`Rendering "${sc.name}"…`, base + span * 0.3);
      const { blob } = await renderVideoBlob(panels, tracks);

      onProgress?.(`Verifying "${sc.name}"…`, base + span * 0.7);
      steps.push(...(await verify(blob, panels)));
    } catch (e) {
      steps.push({
        label: 'Render / verify crashed',
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
    results.push({
      name: sc.name,
      ok: steps.length > 0 && steps.every((st) => st.ok),
      steps,
    });
  }
  onProgress?.('Done', 1);
  return results;
}
