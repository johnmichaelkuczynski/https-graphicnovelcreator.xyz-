// Shared lettering geometry for studio, slideshow and PDF. The provider supplies
// only the photographic plate: not a single character of dialogue is AI-lettered.
export const NOIR_W = 600;
export const NOIR_H = 900;

type Lettering = { lines: string[]; font: number; lineHeight: number; height: number };

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph.trim()) { lines.push(''); continue; }
    let line = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      if (ctx.measureText(word).width > width) return []; // a single unbreakable word
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

function lettering(ctx: CanvasRenderingContext2D, caption: string): Lettering | null {
  const text = caption.trim();
  if (!text) return { lines: [], font: 30, lineHeight: 38, height: 0 };
  for (let font = 30; font >= 19; font--) {
    ctx.font = `${font}px Georgia, "Times New Roman", serif`;
    const lines = wrap(ctx, text, 454);
    const lineHeight = Math.ceil(font * 1.25);
    const height = lines.length * lineHeight + 48;
    if (lines.length && height <= 320) return { lines, font, lineHeight, height };
  }
  return null;
}

export function validateNoirDialogue(caption: string): string | null {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return 'Canvas lettering is unavailable in this browser.';
  return lettering(ctx, caption) ? null : 'Dialogue cannot fit legibly in one speech balloon.';
}

export async function renderNoirPanel(image: Blob, caption: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = NOIR_W;
  canvas.height = NOIR_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas lettering is unavailable in this browser.');
  const layout = lettering(ctx, caption);
  if (!layout) throw new Error('Dialogue cannot fit legibly in one speech balloon. Shorten it or split it across panels.');
  const bitmap = await createImageBitmap(image);
  try {
    const crop = Math.min(bitmap.width / NOIR_W, bitmap.height / NOIR_H);
    ctx.drawImage(bitmap, (bitmap.width - NOIR_W * crop) / 2, (bitmap.height - NOIR_H * crop) / 2,
      NOIR_W * crop, NOIR_H * crop, 0, 0, NOIR_W, NOIR_H);
  } finally {
    bitmap.close();
  }
  if (layout.lines.length) {
    const x = 30;
    const y = 24;
    const w = 540;
    const h = layout.height;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#080808';
    ctx.fillStyle = '#fff';
    // Draw the tail first so it joins naturally to the body of the balloon.
    ctx.beginPath();
    ctx.moveTo(411, y + h - 4);
    ctx.lineTo(380, y + h + 40);
    ctx.lineTo(390, y + h - 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(75, h / 2));
    ctx.fill();
    ctx.stroke();
    ctx.font = `${layout.font}px Georgia, "Times New Roman", serif`;
    ctx.fillStyle = '#080808';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const firstY = y + h / 2 - ((layout.lines.length - 1) * layout.lineHeight) / 2;
    layout.lines.forEach((line, i) => ctx.fillText(line, NOIR_W / 2, firstY + i * layout.lineHeight));
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not render the Film Noir panel.')), 'image/png');
  });
}