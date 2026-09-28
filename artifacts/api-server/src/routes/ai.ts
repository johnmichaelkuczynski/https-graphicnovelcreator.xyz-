import express, { Router, type IRouter } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";

const router: IRouter = Router();

// Production requires a session; development preview uses a non-admin principal.
router.use(isAuthenticated);

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().max(100_000),
});

const modeSchema = z.enum(["standard", "mature"]);

// The client never sends keys, base URLs, or model names. All providers and
// their keys live here in the backend (env secrets) and are never exposed.
const scriptSchema = z.object({
  mode: modeSchema.optional().default("standard"),
  messages: z.array(messageSchema).min(1).max(4),
  temperature: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().min(1).max(8192).optional(),
}).strict();

const imageSchema = z.object({
  mode: modeSchema.optional().default("standard"),
  prompt: z.string().min(1).max(20_000),
  negative_prompt: z.string().optional(),
  seed: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  steps: z.number().optional(),
}).strict();

// ---- Fixed backend providers (keys come from env, never the client) ----
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const VENICE_CHAT_URL = "https://api.venice.ai/api/v1/chat/completions";
const VENICE_CHAT_MODEL = "llama-3.3-70b";
// Venice image/generate supports binary PNG with return_binary, pixel dimensions
// for venice-sd35 (multiples of 16), and a 1500-character prompt limit.
const VENICE_IMAGE_URL = "https://api.venice.ai/api/v1/image/generate";
const VENICE_IMAGE_MODEL = "venice-sd35";
const DEZGO_FLUX_URL = "https://api.dezgo.com/text2image_flux";
const DEZGO_MODEL = "flux_1_schnell";
// Image-to-image edits use a Stable Diffusion model (Flux has no img2img on Dezgo).
const DEZGO_I2I_URL = "https://api.dezgo.com/image2image";
const DEZGO_I2I_MODEL = "realistic_vision_5_1";

type ChatMessage = z.infer<typeof messageSchema>;

// Generate the story text with Anthropic (Claude).
async function anthropicChat(
  messages: ChatMessage[],
  temperature: number | undefined,
  maxTokens: number | undefined,
  timeoutMs: number,
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("anthropic-not-configured");

  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const convo = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  if (convo.length === 0) convo.push({ role: "user", content: system });

  const body: Record<string, unknown> = {
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens ?? 4096,
    messages: convo,
  };
  if (system) body.system = system;
  if (typeof temperature === "number") body.temperature = temperature;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`anthropic-${r.status}`);
    const j = (await r.json()) as { content?: { type: string; text?: string }[] };
    return (j.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("");
  } finally {
    clearTimeout(timer);
  }
}

// Fallback story generator (Venice, OpenAI-compatible chat).
async function veniceChat(
  messages: ChatMessage[],
  temperature: number | undefined,
  maxTokens: number | undefined,
  timeoutMs: number,
): Promise<string> {
  const key = process.env.VENICE_API_KEY;
  if (!key) throw new Error("venice-not-configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(VENICE_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: VENICE_CHAT_MODEL,
        messages,
        temperature: temperature ?? 0.85,
        max_tokens: maxTokens ?? 4096,
      }),
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`venice-${r.status}`);
    const j = (await r.json()) as {
      choices?: { message?: { content?: string }; text?: string }[];
    };
    return j.choices?.[0]?.message?.content ?? j.choices?.[0]?.text ?? "";
  } finally {
    clearTimeout(timer);
  }
}

// Dezgo Flux limits: sizes are multiples of 64 up to 1024; Flux-schnell wants
// only a few steps. Clamp client-provided sizes so a preset can't break the call.
function clampDim(n: number | undefined): number {
  const v = Math.round((n ?? 768) / 64) * 64;
  return Math.max(256, Math.min(1024, v));
}
function clampSteps(n: number | undefined): number {
  return Math.max(1, Math.min(8, Math.round(n ?? 4)));
}

function isPng(bytes: Buffer): boolean {
  return bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

// Tells the client whether AI generation is ready (keys present). No secrets,
// models, or provider details are ever sent to the browser.
router.get("/ai/config", (_req, res) => {
  const standard = !!(
    (process.env.ANTHROPIC_API_KEY || process.env.VENICE_API_KEY) &&
    process.env.DEZGO_API_KEY
  );
  const mature = !!process.env.VENICE_API_KEY;
  res.json({ ready: standard, modes: { standard, mature } });
});

router.post("/ai/script", async (req, res) => {
  const parsed = scriptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const { mode, messages, temperature, max_tokens } = parsed.data;
  if (mode === "mature") {
    if (!process.env.VENICE_API_KEY) {
      res.status(503).json({ error: "Mature themes generation requires Venice to be configured." });
      return;
    }
    try {
      const content = await veniceChat(messages, temperature, max_tokens, 120_000);
      if (!content.trim()) {
        res.status(502).json({ error: "Venice returned no story text. Try again." });
        return;
      }
      res.json({ content });
    } catch (err) {
      req.log.error({ err }, "Venice story generation failed");
      res.status(502).json({ error: "Venice could not generate the story. Check Venice availability and try again." });
    }
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.VENICE_API_KEY) {
    res.status(503).json({ error: "Story generation is not configured." });
    return;
  }

  let content = "";
  try {
    content = await anthropicChat(messages, temperature, max_tokens, 120_000);
  } catch (err) {
    req.log.warn({ err }, "Anthropic script failed, trying Venice");
    try {
      content = await veniceChat(messages, temperature, max_tokens, 120_000);
    } catch (err2) {
      req.log.error({ err: err2 }, "AI script generation failed");
      res.status(502).json({ error: "Could not generate the story. Try again." });
      return;
    }
  }

  if (!content.trim()) {
    res.status(502).json({ error: "The AI returned no story text. Try again." });
    return;
  }
  res.json({ content });
});

router.post("/ai/image", async (req, res) => {
  const parsed = imageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const { mode, prompt, negative_prompt, seed, width, height, steps } = parsed.data;
  const key = mode === "mature" ? process.env.VENICE_API_KEY : process.env.DEZGO_API_KEY;
  if (!key) {
    res.status(503).json({ error: mode === "mature"
      ? "Mature themes image generation requires Venice to be configured."
      : "Image generation is not configured." });
    return;
  }
  if (mode === "mature" && (prompt.length > 1500 || (negative_prompt?.length ?? 0) > 7500)) {
    res.status(400).json({ error: "Venice image prompts must be at most 1,500 characters (negative prompts at most 7,500). Shorten the style or character descriptions." });
    return;
  }

  const body: Record<string, unknown> = mode === "mature"
    ? {
        model: VENICE_IMAGE_MODEL,
        prompt,
        width: Math.round(clampDim(width) / 16) * 16,
        height: Math.round(clampDim(height) / 16) * 16,
        steps: 25,
        format: "png",
        return_binary: true,
      }
    : {
        prompt,
        model: DEZGO_MODEL,
        width: clampDim(width),
        height: clampDim(height),
        steps: clampSteps(steps),
        format: "png",
      };
  if (negative_prompt) body.negative_prompt = negative_prompt;
  if (typeof seed === "number") body.seed = Math.abs(Math.floor(seed)) % (mode === "mature" ? 999_999_999 : 2_147_483_647);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const upstream = await fetch(mode === "mature" ? VENICE_IMAGE_URL : DEZGO_FLUX_URL, {
      method: "POST",
      headers: mode === "mature"
        ? { Authorization: `Bearer ${key}`, "content-type": "application/json" }
        : { "X-Dezgo-Key": key, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!upstream.ok) {
      req.log.error({ status: upstream.status, mode }, "Image generation failed");
      res.status(502).json({ error: mode === "mature"
        ? "Venice could not generate the image. Check Venice availability and try again."
        : "Could not generate the image. Try again." });
      return;
    }
    const arrayBuf = await upstream.arrayBuffer();
    const bytes = Buffer.from(arrayBuf);
    if (!isPng(bytes)) {
      req.log.error({ mode }, "Image provider returned non-PNG data");
      res.status(502).json({ error: mode === "mature" ? "Venice returned invalid image data." : "Image provider returned invalid image data." });
      return;
    }
    res.setHeader("Content-Type", "image/png");
    res.send(bytes);
  } catch (err) {
    req.log.error({ err, mode }, "AI image request failed");
    res.status(502).json({ error: mode === "mature" ? "Could not reach Venice image generation." : "Could not reach the image provider." });
  } finally {
    clearTimeout(timer);
  }
});

// Modify an uploaded image from a text instruction (image-to-image). The image
// arrives as the raw request body (Content-Type: image/*); the instruction and
// strength come as query params so we avoid base64 bloat and the JSON limit.
router.post(
  "/ai/edit",
  express.raw({ type: ["image/*", "application/octet-stream"], limit: "12mb" }),
  async (req, res) => {
    const key = process.env.DEZGO_API_KEY;
    if (!key) {
      res.status(503).json({ error: "Image editing is not configured." });
      return;
    }

    const prompt = typeof req.query.prompt === "string" ? req.query.prompt.trim() : "";
    if (!prompt) {
      res.status(400).json({ error: "Describe how to modify the image." });
      return;
    }
    const negativePrompt =
      typeof req.query.negative_prompt === "string" ? req.query.negative_prompt.trim() : "";

    let strength = Number(req.query.strength);
    if (!Number.isFinite(strength)) strength = 0.65;
    strength = Math.max(0.1, Math.min(1, strength));

    const image = req.body as Buffer;
    if (!Buffer.isBuffer(image) || image.length === 0) {
      res.status(400).json({ error: "No image was uploaded." });
      return;
    }

    const form = new FormData();
    form.append("init_image", new Blob([new Uint8Array(image)], { type: "image/png" }), "input.png");
    form.append("prompt", prompt);
    form.append("strength", String(strength));
    form.append("model", DEZGO_I2I_MODEL);
    form.append("steps", "30");
    form.append("guidance", "7.5");
    form.append("format", "png");
    if (negativePrompt) form.append("negative_prompt", negativePrompt);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180_000);
    try {
      // Do NOT set Content-Type here — fetch adds the multipart boundary for us.
      const upstream = await fetch(DEZGO_I2I_URL, {
        method: "POST",
        headers: { "X-Dezgo-Key": key },
        body: form,
        signal: controller.signal,
      });
      if (!upstream.ok) {
        req.log.error({ status: upstream.status }, "Dezgo image edit failed");
        res.status(502).json({ error: "Could not modify the image. Try again." });
        return;
      }
      const arrayBuf = await upstream.arrayBuffer();
      res.setHeader("Content-Type", "image/png");
      res.send(Buffer.from(arrayBuf));
    } catch (err) {
      req.log.error({ err }, "AI image edit request failed");
      res.status(502).json({ error: "Could not reach the image provider." });
    } finally {
      clearTimeout(timer);
    }
  },
);

// ---- ElevenLabs character speech (server-key) ----
// Uses the app's own ElevenLabs key from the environment; the host is fixed.
const ELEVEN_BASE = "https://api.elevenlabs.io";

function elevenKey(): string | undefined {
  return process.env.ELEVEN_API_KEY || process.env.ELEVEN_LABS_API_KEY;
}

const ttsSchema = z.object({
  text: z.string().min(1).max(5000),
  voiceId: z.string().min(1),
  modelId: z.string().optional(),
});

router.get("/ai/voices", async (req, res) => {
  const key = elevenKey();
  if (!key) {
    res.status(503).json({ error: "Character voices are not configured." });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const upstream = await fetch(`${ELEVEN_BASE}/v1/voices`, {
      headers: { "xi-api-key": key },
      signal: controller.signal,
    });
    if (!upstream.ok) {
      res.status(502).json({ error: "Could not load voices." });
      return;
    }
    const data = (await upstream.json()) as {
      voices?: { voice_id: string; name: string; category?: string }[];
    };
    const voices = (data.voices ?? []).map((v) => ({
      voiceId: v.voice_id,
      name: v.name,
      category: v.category,
    }));
    res.json({ voices });
  } catch (err) {
    req.log.error({ err }, "ElevenLabs voices fetch failed");
    res.status(502).json({ error: "Could not load voices." });
  } finally {
    clearTimeout(timer);
  }
});

router.post("/ai/tts", async (req, res) => {
  const key = elevenKey();
  if (!key) {
    res.status(503).json({ error: "Character voices are not configured." });
    return;
  }

  const parsed = ttsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const { text, voiceId, modelId } = parsed.data;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const upstream = await fetch(
      `${ELEVEN_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: modelId || "eleven_multilingual_v2",
        }),
        signal: controller.signal,
      },
    );
    if (!upstream.ok) {
      // Log only the status, not the body (it can echo the user's text).
      req.log.error({ status: upstream.status }, "ElevenLabs TTS failed");
      res.status(502).json({ error: "Speech generation failed." });
      return;
    }
    const arrayBuf = await upstream.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    res.send(Buffer.from(arrayBuf));
  } catch (err) {
    req.log.error({ err }, "ElevenLabs TTS request failed");
    res.status(502).json({ error: "Speech generation failed." });
  } finally {
    clearTimeout(timer);
  }
});

export default router;
