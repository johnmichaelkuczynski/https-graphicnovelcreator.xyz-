import { AiSettings } from './ai-settings';
import { StylePreset } from './style-presets';

const SCRIPT_URL = '/api/ai/script';
const IMAGE_URL = '/api/ai/image';

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

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text };
  }
  if (!res.ok) {
    const msg =
      json?.error?.message ||
      (typeof json?.error === 'string' ? json.error : null) ||
      json?.message ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
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
  settings: AiSettings,
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
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.chatModel,
    temperature: 0.85,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const content: string =
    json?.choices?.[0]?.message?.content ??
    json?.choices?.[0]?.text ??
    '';
  if (!content) {
    throw new Error('The text model returned no content. Check your chat model name and key.');
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

function base64ToBlob(b64: string, mime = 'image/png'): Blob {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64;
  const byteChars = atob(clean);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function generateImage(
  settings: AiSettings,
  prompt: string,
  style: StylePreset,
  seed: number,
): Promise<Blob> {
  const json = await postJson(IMAGE_URL, {
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.imageModel,
    prompt,
    seed,
    width: style.image.width,
    height: style.image.height,
    steps: style.image.steps,
    n: 1,
    response_format: 'b64_json',
  });

  // Handle the various OpenAI-compatible / provider response shapes.
  const data = json?.data?.[0] ?? json?.images?.[0] ?? json?.output?.[0];

  // 1) base64 (OpenAI: data[].b64_json; Venice: images[] as base64 strings)
  const b64 =
    json?.data?.[0]?.b64_json ??
    (typeof json?.images?.[0] === 'string' ? json.images[0] : undefined) ??
    (typeof data === 'string' ? data : undefined) ??
    data?.b64_json;
  if (typeof b64 === 'string' && b64.length > 0) {
    return base64ToBlob(b64);
  }

  // 2) hosted url
  const url = json?.data?.[0]?.url ?? data?.url;
  if (typeof url === 'string' && url.length > 0) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to download the generated image.');
    return await res.blob();
  }

  throw new Error('The image model returned no image. Check your image model name.');
}

export interface ConvertParams {
  settings: AiSettings;
  sourceText: string;
  outputSpec: string;
  style: StylePreset;
  customStyle: string;
  panelCount: number;
  onProgress?: (p: ConvertProgress) => void;
}

export async function convertTextToNovel(params: ConvertParams): Promise<GeneratedPanel[]> {
  const { settings, sourceText, outputSpec, style, customStyle, panelCount, onProgress } = params;

  onProgress?.({ stage: 'script', current: 0, total: panelCount, message: 'Writing the story…' });
  const script = await generateScript(settings, sourceText, outputSpec, panelCount);

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
    const imageBlob = await generateImage(settings, prompt, style, seed);
    results.push({ caption: script[i].caption, scene: script[i].scene, imageBlob });
  }

  onProgress?.({ stage: 'done', current: script.length, total: script.length, message: 'Done!' });
  return results;
}
