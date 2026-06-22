import { jsPDF } from 'jspdf';
import fixWebmDuration from 'fix-webm-duration';
import { Panel, AudioTrack } from './db';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function extFromType(type: string, fallback = 'png') {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[type] || fallback;
}

function safeName(caption: string, max = 40) {
  return caption
    .trim()
    .slice(0, max)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

export function downloadPanelImage(panel: Panel, index: number) {
  const ext = extFromType(panel.imageBlob.type);
  const cap = safeName(panel.caption);
  const name = `panel-${String(index + 1).padStart(2, '0')}${cap ? '-' + cap : ''}.${ext}`;
  downloadBlob(panel.imageBlob, name);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

// Re-encode any image into a JPEG data URL so jsPDF always accepts it.
function imageToJpegDataUrl(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function exportPdf(panels: Panel[], projectName: string) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 40;

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    if (i > 0) pdf.addPage();

    const img = await blobToImage(panel.imageBlob);
    const dataUrl = imageToJpegDataUrl(img);

    let y = margin;
    pdf.setFontSize(10);
    pdf.setTextColor(140);
    pdf.text(`#${i + 1}`, margin, y);
    y += 16;

    const caption = panel.caption.trim();
    if (caption) {
      pdf.setFontSize(14);
      pdf.setTextColor(20);
      const lines = pdf.splitTextToSize(caption, pageW - margin * 2);
      pdf.text(lines, margin, y);
      y += lines.length * 18 + 12;
    }

    const maxW = pageW - margin * 2;
    const maxH = pageH - y - margin;
    const ratio = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    const x = (pageW - w) / 2;
    pdf.addImage(dataUrl, 'JPEG', x, y, w, h);
  }

  pdf.save(`${safeName(projectName) || 'graphic-novel'}.pdf`);
}

function pickVideoMime(): string {
  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

function drawPanelFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  img: HTMLImageElement,
  caption: string,
) {
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, W, H);

  const captionText = caption.trim();
  const captionH = captionText ? 120 : 0;
  const areaY = captionH;
  const areaH = H - captionH;

  const ratio = Math.min(W / img.width, areaH / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  const x = (W - w) / 2;
  const y = areaY + (areaH - h) / 2;
  ctx.drawImage(img, x, y, w, h);

  if (captionText) {
    ctx.fillStyle = '#fdf2f8';
    ctx.fillRect(0, 0, W, captionH);
    ctx.fillStyle = '#111111';
    ctx.font = '32px Georgia, serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const maxW = W - 80;
    const words = captionText.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    const shown = lines.slice(0, 2);
    const lineH = 38;
    const startY = captionH / 2 - ((shown.length - 1) * lineH) / 2;
    shown.forEach((l, idx) => ctx.fillText(l, 40, startY + idx * lineH));
  }
}

export async function exportVideo(
  panels: Panel[],
  tracks: AudioTrack[],
  projectName: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  if (panels.length === 0) return;

  const W = 1280;
  const H = 960;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const images = await Promise.all(panels.map((p) => blobToImage(p.imageBlob)));

  const fps = 30;
  const stream = canvas.captureStream(fps);

  // Per-panel start offsets (seconds) so panel-specific audio can be scheduled
  // at the moment its panel appears.
  const panelStartSec: number[] = [];
  {
    let acc = 0;
    for (const p of panels) {
      panelStartSec.push(acc);
      acc += Math.max(0.5, p.durationSeconds);
    }
  }

  const hasPanelAudio = panels.some((p) => p.audioBlob);

  // Decode all audio tracks up front (do NOT start them yet — scheduling
  // must happen after the recorder starts, or early audio is lost).
  let audioCtx: AudioContext | null = null;
  let decodedBuffers: AudioBuffer[] = [];
  // Panel audio decoded buffers keyed by panel index.
  const decodedPanelBuffers: { startSec: number; buffer: AudioBuffer }[] = [];
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  if (tracks.length > 0 || hasPanelAudio) {
    try {
      audioCtx = new AudioContext();
      audioDest = audioCtx.createMediaStreamDestination();
      for (const track of tracks) {
        try {
          const buf = await track.audioBlob.arrayBuffer();
          const decoded = await audioCtx.decodeAudioData(buf);
          decodedBuffers.push(decoded);
        } catch {
          // skip tracks that can't be decoded
        }
      }
      for (let i = 0; i < panels.length; i++) {
        const pa = panels[i].audioBlob;
        if (!pa) continue;
        try {
          const buf = await pa.arrayBuffer();
          const decoded = await audioCtx.decodeAudioData(buf);
          decodedPanelBuffers.push({ startSec: panelStartSec[i], buffer: decoded });
        } catch {
          // skip panel audio that can't be decoded
        }
      }
      audioDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch {
      audioCtx = null;
      audioDest = null;
      decodedBuffers = [];
      decodedPanelBuffers.length = 0;
    }
  }

  const mime = pickVideoMime();
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const totalMs = panels.reduce((sum, p) => sum + Math.max(0.5, p.durationSeconds) * 1000, 0);

  // Cumulative panel-boundary times in ms, used to map elapsed time -> panel.
  const boundariesMs: number[] = [];
  {
    let acc = 0;
    for (const p of panels) {
      acc += Math.max(0.5, p.durationSeconds) * 1000;
      boundariesMs.push(acc);
    }
  }

  return new Promise<void>((resolve) => {
    let drawTimer: ReturnType<typeof setInterval> | null = null;
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let startTime = 0;

    const cleanupTimers = () => {
      if (drawTimer !== null) clearInterval(drawTimer);
      if (stopTimer !== null) clearTimeout(stopTimer);
      drawTimer = null;
      stopTimer = null;
    };

    const stopRecording = () => {
      if (stopped) return;
      stopped = true;
      cleanupTimers();
      // Draw the final panel one last time so the tail isn't a stale frame.
      drawPanelFrame(ctx, W, H, images[images.length - 1], panels[panels.length - 1].caption);
      if (recorder.state !== 'inactive') recorder.stop();
    };

    recorder.onstop = async () => {
      cleanupTimers();
      const type = mime || 'video/webm';
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const actualMs = startTime ? performance.now() - startTime : totalMs;
      let blob = new Blob(chunks, { type });
      // Chrome's MediaRecorder writes WebM without a valid duration header, so
      // players only play a fraction of the file. Patch the duration in.
      if (ext === 'webm') {
        try {
          blob = await fixWebmDuration(blob, Math.round(actualMs), { logger: false });
        } catch {
          // fall back to the unpatched blob
        }
      }
      downloadBlob(blob, `${safeName(projectName) || 'graphic-novel'}.${ext}`);
      if (audioCtx) audioCtx.close().catch(() => {});
      onProgress?.(1);
      resolve();
    };

    // Flush a chunk every second so a long recording isn't held as one blob.
    recorder.start(1000);

    // Now that recording has begun, schedule the decoded audio.
    if (audioCtx && audioDest) {
      const base = audioCtx.currentTime + 0.1;
      // Sequence-wide tracks play back-to-back from the start.
      let offset = 0;
      for (const decoded of decodedBuffers) {
        const src = audioCtx.createBufferSource();
        src.buffer = decoded;
        src.connect(audioDest);
        src.start(base + offset);
        offset += decoded.duration;
      }
      // Per-panel tracks play at the moment their panel appears, layered on top.
      for (const { startSec, buffer } of decodedPanelBuffers) {
        const src = audioCtx.createBufferSource();
        src.buffer = buffer;
        src.connect(audioDest);
        src.start(base + startSec);
      }
    }

    startTime = performance.now();

    // Draw via setInterval (not requestAnimationFrame): rAF is fully paused when
    // the tab/preview loses focus, which would freeze the video partway through.
    // Timers keep firing in the background (throttled to ~1s, which is fine since
    // panels last whole seconds), so every panel makes it into the recording.
    const draw = () => {
      const elapsed = performance.now() - startTime;
      onProgress?.(Math.min(0.99, elapsed / totalMs));

      let idx = panels.length - 1;
      for (let i = 0; i < boundariesMs.length; i++) {
        if (elapsed < boundariesMs[i]) {
          idx = i;
          break;
        }
      }

      // Always redraw so the canvas stream stays current even if a panel was
      // briefly skipped while the tab was throttled in the background.
      drawPanelFrame(ctx, W, H, images[idx], panels[idx].caption);

      if (elapsed >= totalMs) stopRecording();
    };

    // Draw the first frame immediately, then keep the canvas in sync.
    draw();
    drawTimer = setInterval(draw, 200);
    // Independent wall-clock stop so the recording always ends even if the draw
    // loop is throttled in the background.
    stopTimer = setTimeout(stopRecording, totalMs + 400);
  });
}
