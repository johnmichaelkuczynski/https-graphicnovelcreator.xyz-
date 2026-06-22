import { StylePreset } from './style-presets';

const SCRIPT_URL = '/api/ai/script';
const IMAGE_URL = '/api/ai/image';
const EDIT_URL = '/api/ai/edit';

export interface ScriptPanel {
  caption: string;
  scene: string;
}

export interface GeneratedPanel {
  caption: string;
  scene: string;
  imageBlob: Blob;
}

export interface ConvertProgress {
  stage: 'script' | 'image' | 'done';
  current: number;
  total: number;
  message: string;
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text };
  }
  return (
    json?.error?.message ||
    (typeof json?.error === 'string' ? json.error : null) ||
    json?.message ||
    `Request failed (${res.status})`
  );
}

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

// Pull a JSON object out of a model response that may be wrapped in prose or
// ```json fences.
function extractJson(content: string): any {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }
  throw new Error('The AI did not return readable story data. Try again.');
}

export async function generateScript(
  sourceText: string,
  outputSpec: string,
  panelCount: number,
): Promise<ScriptPanel[]> {
  const system = [
    `You adapt source material into a sequential graphic novel of EXACTLY ${panelCount} panels.`,
    `Return ONLY JSON shaped: {"panels":[{"caption":"","scene":""}]} with exactly ${panelCount} items in reading order.`,
    `"caption" = the words shown in that panel (narration or dialogue, e.g. "He said: ...". Keep it short; it may be an empty string.`,
    `"scene" = a vivid, concrete visual description of WHAT is depicted: characters, their appearance, setting, action, composition.`,
    `CRITICAL: in "scene" never mention art style, medium, colors-as-style, "comic", "panel", "drawing", "illustration" or how it is rendered — describe only the subject matter.`,
    `Keep recurring characters visually consistent (same described appearance) in every scene so they look like the same person throughout.`,
  ].join('\n');

  const user = `DESIRED OUTPUT (what the story should become):\n${outputSpec}\n\nSOURCE TEXT:\n${sourceText}`;

  const json = await postJson(SCRIPT_URL, {
    temperature: 0.85,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const content: string = typeof json?.content === 'string' ? json.content : '';
  if (!content) {
    throw new Error('The AI returned no story text. Try again.');
  }

  const parsed = extractJson(content);
  const rawPanels: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.panels)
      ? parsed.panels
      : [];

  let panels: ScriptPanel[] = rawPanels.map((p) => ({
    caption: typeof p?.caption === 'string' ? p.caption : '',
    scene:
      typeof p?.scene === 'string'
        ? p.scene
        : typeof p?.description === 'string'
          ? p.description
          : '',
  }));

  panels = panels.filter((p) => p.scene.trim().length > 0);
  if (panels.length === 0) {
    throw new Error('The AI could not turn that into panels. Try simpler input or fewer panels.');
  }
  // Honor the requested count exactly: trim extras, pad by repeating the last
  // scene if the model returned too few.
  if (panels.length > panelCount) panels = panels.slice(0, panelCount);
  while (panels.length < panelCount) {
    panels.push({ ...panels[panels.length - 1] });
  }
  return panels;
}

export async function generateImage(
  prompt: string,
  style: StylePreset,
  seed: number,
): Promise<Blob> {
  // The image route returns raw PNG bytes (the provider lives server-side).
  const res = await fetch(IMAGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      seed,
      width: style.image.width,
      height: style.image.height,
      steps: style.image.steps,
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const blob = await res.blob();
  if (!blob.size) throw new Error('The image provider returned no image. Try again.');
  return blob;
}

// Shrink an uploaded image to a sane size before sending it to the editor, so
// the round-trip stays fast and cheap. SD models like dimensions that are
// multiples of 8; we cap the longest edge and re-encode to PNG.
async function downscaleImage(blob: Blob, maxEdge = 1024): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(64, Math.round((bitmap.width * scale) / 8) * 8);
    const h = Math.max(64, Math.round((bitmap.height * scale) / 8) * 8);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process the image.');
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not process the image.'))),
        'image/png',
      ),
    );
  } finally {
    bitmap.close?.();
  }
}

// Send an image plus a plain-language instruction and get the modified image
// back. The provider lives server-side; we post the raw PNG with the prompt and
// strength as query params.
export async function editImage(
  image: Blob,
  prompt: string,
  strength: number,
  negativePrompt?: string,
): Promise<Blob> {
  const resized = await downscaleImage(image, 1024);
  const params = new URLSearchParams({ prompt, strength: String(strength) });
  if (negativePrompt && negativePrompt.trim()) {
    params.set('negative_prompt', negativePrompt.trim());
  }
  const res = await fetch(`${EDIT_URL}?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: resized,
  });
  if (!res.ok) throw new Error(await readError(res));
  const blob = await res.blob();
  if (!blob.size) throw new Error('The editor returned no image. Try again.');
  return blob;
}

export interface ConvertParams {
  sourceText: string;
  outputSpec: string;
  style: StylePreset;
  customStyle: string;
  panelCount: number;
  onProgress?: (p: ConvertProgress) => void;
}

export async function convertTextToNovel(params: ConvertParams): Promise<GeneratedPanel[]> {
  const { sourceText, outputSpec, style, customStyle, panelCount, onProgress } = params;

  onProgress?.({ stage: 'script', current: 0, total: panelCount, message: 'Writing the story…' });
  const script = await generateScript(sourceText, outputSpec, panelCount);

  // The exact same style text is prepended to EVERY panel, and a single fixed
  // seed is reused for all panels, so the drawing style cannot drift.
  const styleText = (style.id === 'custom' ? customStyle : style.prompt).trim();
  const seed = Math.floor(Math.random() * 1_000_000_000);

  const results: GeneratedPanel[] = [];
  for (let i = 0; i < script.length; i++) {
    onProgress?.({
      stage: 'image',
      current: i,
      total: script.length,
      message: `Drawing panel ${i + 1} of ${script.length}…`,
    });
    const prompt = styleText ? `${styleText}. SCENE: ${script[i].scene}` : script[i].scene;
    const imageBlob = await generateImage(prompt, style, seed);
    results.push({ caption: script[i].caption, scene: script[i].scene, imageBlob });
  }

  onProgress?.({ stage: 'done', current: script.length, total: script.length, message: 'Done!' });
  return results;
}
