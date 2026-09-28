import { jsPDF } from 'jspdf';
import fixWebmDuration from 'fix-webm-duration';
import { Muxer, ArrayBufferTarget } from 'webm-muxer';
import { Panel, AudioTrack, Project, getPanelImages } from './db';
import { collageRows } from './collage';
import { renderNoirPanel } from './noir-render';

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

// Re-encode any image into a downscaled JPEG data URL so jsPDF always accepts
// it and a deck of large photos can't freeze the main thread / blow up memory.
// Returns the encoded dimensions too, so the caller lays out from the real
// (downscaled) size, not the source's natural megapixels.
const PDF_MAX_EDGE = 1600;
function imageToJpegDataUrl(img: HTMLImageElement): { dataUrl: string; width: number; height: number } {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const scale = Math.min(1, PDF_MAX_EDGE / Math.max(srcW, srcH || 1));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), width, height };
}

// Load every image of a panel (primary + extras) in display order, skipping any
// that can't be decoded so one bad blob never aborts the whole export.
async function loadPanelImages(panel: Panel): Promise<HTMLImageElement[]> {
  const out: HTMLImageElement[] = [];
  for (const b of getPanelImages(panel)) {
    try {
      out.push(await blobToImage(b));
    } catch {
      // skip unreadable image
    }
  }
  return out;
}

interface Rect { x: number; y: number; w: number; h: number }

// Layout for 1–8 images inside a box, laid out in rows. Mirrors the on-screen
// ImageCollage by sharing `collageRows` (1 full, 2 side-by-side, 3 = two on top
// + one spanning the bottom, 4 = 2x2, and so on up to 8).
function collageRects(count: number, x: number, y: number, w: number, h: number, gap: number): Rect[] {
  if (count <= 1) return [{ x, y, w, h }];
  const rows = collageRows(count);
  const nRows = rows.length;
  const rowH = (h - gap * (nRows - 1)) / nRows;
  const rects: Rect[] = [];
  let ry = y;
  for (const rowLen of rows) {
    const tileW = (w - gap * (rowLen - 1)) / rowLen;
    let rx = x;
    for (let i = 0; i < rowLen; i++) {
      rects.push({ x: rx, y: ry, w: tileW, h: rowH });
      rx += tileW + gap;
    }
    ry += rowH + gap;
  }
  return rects;
}

// Draw an image to cover the rect (crop-to-fill, centered) — the canvas
// equivalent of CSS object-fit: cover.
function drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const imgRatio = iw / ih;
  const rectRatio = w / h;
  let sx: number, sy: number, sw: number, sh: number;
  if (imgRatio > rectRatio) {
    sh = ih;
    sw = sh * rectRatio;
    sx = (iw - sw) / 2;
    sy = 0;
  } else {
    sw = iw;
    sh = sw / rectRatio;
    sx = 0;
    sy = (ih - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// Encode a cover-cropped JPEG sized to the given target (in PDF points, ~2x for
// sharpness, capped at PDF_MAX_EDGE) for one collage tile.
function imageToCoverJpegDataUrl(img: HTMLImageElement, targetW: number, targetH: number): string {
  const scale = Math.min(2, PDF_MAX_EDGE / Math.max(targetW, targetH, 1));
  const W = Math.max(1, Math.round(targetW * scale));
  const H = Math.max(1, Math.round(targetH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  drawImageCover(ctx, img, 0, 0, W, H);
  return canvas.toDataURL('image/jpeg', 0.85);
}

// Yield to the event loop so the progress UI can paint and the tab never looks
// frozen while we crunch a large deck.
const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

export async function exportPdf(
  panels: Panel[],
  projectName: string,
  onProgress?: (fraction: number) => void,
  project?: Project | null,
) {
  if (panels.length === 0) throw new Error('There are no panels to export. Add at least one panel first.');
  if (project?.layout === 'film-noir') {
    await exportNoirPdf(panels, projectName, project.pageTitle ?? '', onProgress);
    return;
  }

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 40;
  let rendered = 0;

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    if (i > 0) pdf.addPage();

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

    // One unreadable image must not abort the whole export — note it and move on.
    try {
      const loaded = await loadPanelImages(panel);
      if (loaded.length === 0) throw new Error('no images');

      const areaX = margin;
      const areaW = pageW - margin * 2;
      const areaH = pageH - y - margin;

      if (loaded.length === 1) {
        const { dataUrl, width, height } = imageToJpegDataUrl(loaded[0]);
        const ratio = Math.min(areaW / width, areaH / height);
        const w = width * ratio;
        const h = height * ratio;
        const x = (pageW - w) / 2;
        pdf.addImage(dataUrl, 'JPEG', x, y, w, h);
      } else {
        const rects = collageRects(loaded.length, areaX, y, areaW, areaH, 6);
        for (let k = 0; k < loaded.length; k++) {
          const r = rects[k];
          const dataUrl = imageToCoverJpegDataUrl(loaded[k], r.w, r.h);
          pdf.addImage(dataUrl, 'JPEG', r.x, r.y, r.w, r.h);
        }
      }
      rendered++;
    } catch {
      pdf.setFontSize(11);
      pdf.setTextColor(180, 60, 60);
      pdf.text('[image could not be loaded]', margin, y + 16);
    }

    onProgress?.((i + 1) / panels.length);
    // Let the UI breathe between pages.
    await nextFrame();
  }

  if (rendered === 0) {
    throw new Error('None of the panel images could be read, so the PDF would be blank.');
  }

  pdf.save(`${safeName(projectName) || 'graphic-novel'}.pdf`);
}

// Full page image assembled from exactly the same app-lettered PNGs seen in the
// studio and preview. Keep standard (one-panel-per-page) PDFs untouched.
async function exportNoirPdf(panels: Panel[], name: string, title: string, onProgress?: (fraction: number) => void) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1800;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas page composition is unavailable in this browser.');
  const pages = Math.ceil(panels.length / 4);
  for (let page = 0; page < pages; page++) {
    if (page) pdf.addPage();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const titleHeight = title.trim() && page === 0 ? 120 : 0;
    if (titleHeight) {
      ctx.fillStyle = '#080808';
      ctx.fillRect(16, 16, 1168, 108);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const words = title.trim().split(/\s+/);
      let fit = false;
      for (let font = 56; font >= 24; font--) {
        ctx.font = `bold ${font}px Georgia, "Times New Roman", serif`;
        const rows: string[] = [''];
        for (const word of words) {
          const last = rows.length - 1;
          const next = rows[last] ? `${rows[last]} ${word}` : word;
          if (ctx.measureText(next).width > 1080 && rows[last]) rows.push(word);
          else rows[last] = next;
        }
        if (rows.length <= 2 && rows.every((row) => ctx.measureText(row).width <= 1080)) {
          rows.forEach((row, i) => ctx.fillText(row, 600, rows.length === 1 ? 70 : 48 + i * 49));
          fit = true;
          break;
        }
      }
      if (!fit) throw new Error('Film Noir title does not fit the page banner. Shorten the title and export again.');
    }
    const margin = 16, gap = 12;
    const cellW = (1200 - 2 * margin - gap) / 2;
    const cellH = (1800 - 2 * margin - gap - titleHeight) / 2;
    for (let slot = 0; slot < 4; slot++) {
      const index = page * 4 + slot;
      if (index >= panels.length) break;
      try {
        const plate = await renderNoirPanel(panels[index].imageBlob, panels[index].caption);
        const bitmap = await createImageBitmap(plate);
        try {
          ctx.drawImage(bitmap, margin + slot % 2 * (cellW + gap),
            margin + titleHeight + Math.floor(slot / 2) * (cellH + gap), cellW, cellH);
        } finally { bitmap.close(); }
      } catch (err) {
        throw new Error(`Film Noir panel ${index + 1} could not be lettered: ${err instanceof Error ? err.message : String(err)}`);
      }
      onProgress?.((index + 1) / panels.length);
    }
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', 0, 0,
      pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
    await nextFrame();
  }
  pdf.save(`${safeName(name) || 'film-noir'}.pdf`);
}

function drawPanelFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  imgs: HTMLImageElement[],
  caption: string,
) {
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, W, H);

  const captionText = caption.trim();
  const captionH = captionText ? 120 : 0;
  const areaY = captionH;
  const areaH = H - captionH;

  if (imgs.length === 1) {
    const img = imgs[0];
    const ratio = Math.min(W / img.width, areaH / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    const x = (W - w) / 2;
    const y = areaY + (areaH - h) / 2;
    ctx.drawImage(img, x, y, w, h);
  } else if (imgs.length > 1) {
    const rects = collageRects(imgs.length, 0, areaY, W, areaH, 8);
    for (let k = 0; k < imgs.length; k++) {
      const r = rects[k];
      drawImageCover(ctx, imgs[k], r.x, r.y, r.w, r.h);
    }
  }

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

export function totalDurationSec(panels: Panel[]): number {
  return panels.reduce((sum, p) => sum + Math.max(0.5, p.durationSeconds), 0);
}

// ---------------------------------------------------------------------------
// Video export.
//
// The reliable path is WebCodecs: every frame is encoded as fast as the CPU
// allows, completely decoupled from the wall clock and from whether the tab is
// focused. This is what fixes the "frozen on panel N" / "only the first third"
// failures — a real-time canvas captureStream stops compositing when the
// preview loses focus, so it can never be made robust for long exports.
// MediaRecorder is kept only as a fallback for browsers without WebCodecs.
// ---------------------------------------------------------------------------

// Video and audio capabilities are checked independently: a browser that can
// encode video via WebCodecs but lacks the audio APIs should still use the
// robust deterministic video path (just without an audio track) rather than
// falling back to the fragile real-time recorder.
function supportsWebCodecsVideo(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

function supportsWebCodecsAudio(): boolean {
  return (
    typeof AudioEncoder !== 'undefined' &&
    typeof AudioData !== 'undefined' &&
    typeof OfflineAudioContext !== 'undefined'
  );
}

async function pickWebCodecsVideoCodec(
  W: number,
  H: number,
  fps: number,
): Promise<{ enc: string; mux: string } | null> {
  const candidates = [
    { enc: 'vp09.00.10.08', mux: 'V_VP9' },
    { enc: 'vp8', mux: 'V_VP8' },
  ];
  for (const c of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: c.enc,
        width: W,
        height: H,
        bitrate: 5_000_000,
        framerate: fps,
      });
      if (support.supported) return c;
    } catch {
      // try next candidate
    }
  }
  return null;
}

// Mix sequence-wide tracks (back-to-back from t=0) and per-panel tracks (each at
// the moment its panel appears) into a single stereo buffer using an offline
// context, so audio is rendered deterministically and never depends on playback.
async function mixAudioOffline(
  panels: Panel[],
  tracks: AudioTrack[],
  sampleRate: number,
): Promise<AudioBuffer | null> {
  const hasPanelAudio = panels.some((p) => p.audioBlob);
  if (tracks.length === 0 && !hasPanelAudio) return null;

  const totalSec = totalDurationSec(panels);
  const length = Math.max(1, Math.ceil(totalSec * sampleRate));
  const offline = new OfflineAudioContext(2, length, sampleRate);

  const decode = async (blob: Blob) => offline.decodeAudioData(await blob.arrayBuffer());

  let started = false;

  let offset = 0;
  for (const t of tracks) {
    try {
      const dec = await decode(t.audioBlob);
      const src = offline.createBufferSource();
      src.buffer = dec;
      src.connect(offline.destination);
      src.start(offset);
      offset += dec.duration;
      started = true;
    } catch {
      // skip tracks that can't be decoded
    }
  }

  let acc = 0;
  for (let i = 0; i < panels.length; i++) {
    const pa = panels[i].audioBlob;
    if (pa) {
      try {
        const dec = await decode(pa);
        const src = offline.createBufferSource();
        src.buffer = dec;
        src.connect(offline.destination);
        src.start(acc);
        started = true;
      } catch {
        // skip panel audio that can't be decoded
      }
    }
    acc += Math.max(0.5, panels[i].durationSeconds);
  }

  if (!started) return null;
  return offline.startRendering();
}

async function renderVideoWebCodecs(
  panels: Panel[],
  tracks: AudioTrack[],
  codec: { enc: string; mux: string },
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const W = 1280;
  const H = 960;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const imageSets = await Promise.all(panels.map((p) => loadPanelImages(p)));

  const fps = 15;
  const frameDurUs = Math.round(1_000_000 / fps);

  const sampleRate = 48_000;
  // Audio is best-effort: if the browser lacks audio WebCodecs/offline mixing,
  // or the Opus config isn't supported, we still produce a correct (silent)
  // video rather than degrading to the fragile real-time recorder.
  let audioBuffer: AudioBuffer | null = null;
  if (supportsWebCodecsAudio()) {
    try {
      const support = await AudioEncoder.isConfigSupported({
        codec: 'opus',
        numberOfChannels: 2,
        sampleRate,
        bitrate: 128_000,
      });
      if (support.supported) {
        audioBuffer = await mixAudioOffline(panels, tracks, sampleRate);
      }
    } catch {
      audioBuffer = null;
    }
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: codec.mux, width: W, height: H, frameRate: fps },
    audio: audioBuffer
      ? { codec: 'A_OPUS', numberOfChannels: 2, sampleRate }
      : undefined,
    firstTimestampBehavior: 'offset',
  });

  let encodeError: unknown = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e;
    },
  });
  try {
    videoEncoder.configure({
      codec: codec.enc,
      width: W,
      height: H,
      bitrate: 5_000_000,
      framerate: fps,
    });

    let tUs = 0;
    for (let i = 0; i < panels.length; i++) {
      drawPanelFrame(ctx, W, H, imageSets[i], panels[i].caption);
      const durSec = Math.max(0.5, panels[i].durationSeconds);
      const nFrames = Math.max(1, Math.round(durSec * fps));
      for (let f = 0; f < nFrames; f++) {
        if (encodeError) throw encodeError;
        const frame = new VideoFrame(canvas, { timestamp: tUs, duration: frameDurUs });
        videoEncoder.encode(frame, { keyFrame: f === 0 });
        frame.close();
        tUs += frameDurUs;
        // Backpressure so we don't queue thousands of frames at once.
        while (videoEncoder.encodeQueueSize > 20) {
          await new Promise<void>((r) => setTimeout(r, 0));
          if (encodeError) throw encodeError;
        }
      }
      onProgress?.(((i + 1) / panels.length) * (audioBuffer ? 0.8 : 0.95));
    }
    await videoEncoder.flush();
    if (encodeError) throw encodeError;
  } finally {
    if (videoEncoder.state !== 'closed') videoEncoder.close();
  }

  if (audioBuffer) {
    let audioError: unknown = null;
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        audioError = e;
      },
    });
    try {
      audioEncoder.configure({
        codec: 'opus',
        numberOfChannels: 2,
        sampleRate,
        bitrate: 128_000,
      });

      const numChannels = 2;
      const ch0 = audioBuffer.getChannelData(0);
      const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : ch0;
      const chunkFrames = Math.round(sampleRate * 0.1); // 100ms blocks
      for (let i = 0; i < audioBuffer.length; i += chunkFrames) {
        if (audioError) throw audioError;
        const n = Math.min(chunkFrames, audioBuffer.length - i);
        const data = new Float32Array(n * numChannels);
        data.set(ch0.subarray(i, i + n), 0);
        data.set(ch1.subarray(i, i + n), n);
        const ad = new AudioData({
          format: 'f32-planar',
          sampleRate,
          numberOfFrames: n,
          numberOfChannels: numChannels,
          timestamp: Math.round((i / sampleRate) * 1_000_000),
          data,
        });
        audioEncoder.encode(ad);
        ad.close();
        onProgress?.(0.8 + (i / audioBuffer.length) * 0.18);
      }
      await audioEncoder.flush();
      if (audioError) throw audioError;
    } finally {
      if (audioEncoder.state !== 'closed') audioEncoder.close();
    }
  }

  muxer.finalize();
  onProgress?.(1);
  return new Blob([muxer.target.buffer], { type: 'video/webm' });
}

// ---- Fallback: real-time MediaRecorder (only when WebCodecs is unavailable) --

function pickVideoMime(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

async function renderVideoMediaRecorder(
  panels: Panel[],
  tracks: AudioTrack[],
  onProgress?: (fraction: number) => void,
): Promise<{ blob: Blob; ext: string }> {
  const W = 1280;
  const H = 960;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const imageSets = await Promise.all(panels.map((p) => loadPanelImages(p)));

  const fps = 30;
  const stream = canvas.captureStream(fps);

  const panelStartSec: number[] = [];
  {
    let acc = 0;
    for (const p of panels) {
      panelStartSec.push(acc);
      acc += Math.max(0.5, p.durationSeconds);
    }
  }

  const hasPanelAudio = panels.some((p) => p.audioBlob);

  let audioCtx: AudioContext | null = null;
  let decodedBuffers: AudioBuffer[] = [];
  const decodedPanelBuffers: { startSec: number; buffer: AudioBuffer }[] = [];
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  if (tracks.length > 0 || hasPanelAudio) {
    try {
      audioCtx = new AudioContext();
      audioDest = audioCtx.createMediaStreamDestination();
      for (const track of tracks) {
        try {
          decodedBuffers.push(await audioCtx.decodeAudioData(await track.audioBlob.arrayBuffer()));
        } catch {
          // skip
        }
      }
      for (let i = 0; i < panels.length; i++) {
        const pa = panels[i].audioBlob;
        if (!pa) continue;
        try {
          decodedPanelBuffers.push({
            startSec: panelStartSec[i],
            buffer: await audioCtx.decodeAudioData(await pa.arrayBuffer()),
          });
        } catch {
          // skip
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

  const totalMs = totalDurationSec(panels) * 1000;
  const boundariesMs: number[] = [];
  {
    let acc = 0;
    for (const p of panels) {
      acc += Math.max(0.5, p.durationSeconds) * 1000;
      boundariesMs.push(acc);
    }
  }

  return new Promise<{ blob: Blob; ext: string }>((resolve) => {
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
      drawPanelFrame(ctx, W, H, imageSets[imageSets.length - 1], panels[panels.length - 1].caption);
      if (recorder.state !== 'inactive') recorder.stop();
    };

    recorder.onstop = async () => {
      cleanupTimers();
      const type = mime || 'video/webm';
      const actualMs = startTime ? performance.now() - startTime : totalMs;
      let blob = new Blob(chunks, { type });
      try {
        blob = await fixWebmDuration(blob, Math.round(actualMs), { logger: false });
      } catch {
        // keep unpatched blob
      }
      if (audioCtx) audioCtx.close().catch(() => {});
      onProgress?.(1);
      resolve({ blob, ext: 'webm' });
    };

    recorder.start(1000);

    if (audioCtx && audioDest) {
      const base = audioCtx.currentTime + 0.1;
      let offset = 0;
      for (const decoded of decodedBuffers) {
        const src = audioCtx.createBufferSource();
        src.buffer = decoded;
        src.connect(audioDest);
        src.start(base + offset);
        offset += decoded.duration;
      }
      for (const { startSec, buffer } of decodedPanelBuffers) {
        const src = audioCtx.createBufferSource();
        src.buffer = buffer;
        src.connect(audioDest);
        src.start(base + startSec);
      }
    }

    startTime = performance.now();

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
      drawPanelFrame(ctx, W, H, imageSets[idx], panels[idx].caption);
      if (elapsed >= totalMs) stopRecording();
    };

    draw();
    drawTimer = setInterval(draw, 200);
    stopTimer = setTimeout(stopRecording, totalMs + 400);
  });
}

// Renders the slideshow to a video Blob (does not download). Used by both the
// Download menu and the self-test diagnostics.
export async function renderVideoBlob(
  panels: Panel[],
  tracks: AudioTrack[],
  onProgress?: (fraction: number) => void,
): Promise<{ blob: Blob; ext: string }> {
  if (panels.length === 0) throw new Error('No panels to render');
  // Use the robust deterministic encoder whenever the browser can actually
  // encode a codec our muxer supports — not merely when the WebCodecs symbols
  // exist. Some browsers expose VideoEncoder but support neither VP8 nor VP9
  // (e.g. Safari-class); for those we must fall back to MediaRecorder rather
  // than hard-failing. Probing the codec up front is the eligibility gate.
  //
  // Once we've committed to the WebCodecs path, runtime failures are surfaced
  // (thrown), NOT silently downgraded to the fragile real-time recorder — that
  // downgrade is exactly what masked the original "frozen frame" failures.
  const codec = supportsWebCodecsVideo()
    ? await pickWebCodecsVideoCodec(1280, 960, 15)
    : null;
  if (codec) {
    const blob = await renderVideoWebCodecs(panels, tracks, codec, onProgress);
    return { blob, ext: 'webm' };
  }
  return renderVideoMediaRecorder(panels, tracks, onProgress);
}

export async function exportVideo(
  panels: Panel[],
  tracks: AudioTrack[],
  projectName: string,
  onProgress?: (fraction: number) => void,
  project?: Project | null,
): Promise<void> {
  if (panels.length === 0) return;
  const videoPanels = project?.layout === 'film-noir'
    ? await Promise.all(panels.map(async (p, i) => {
        try {
          return { ...p, imageBlob: await renderNoirPanel(p.imageBlob, p.caption), extraImages: [], caption: '' };
        } catch (err) {
          throw new Error(`Film Noir panel ${i + 1} cannot be lettered for video: ${err instanceof Error ? err.message : String(err)}`);
        }
      }))
    : panels;
  const { blob, ext } = await renderVideoBlob(videoPanels, tracks, onProgress);
  downloadBlob(blob, `${safeName(projectName) || 'graphic-novel'}.${ext}`);
}
