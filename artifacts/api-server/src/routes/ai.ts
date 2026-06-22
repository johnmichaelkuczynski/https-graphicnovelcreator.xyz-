import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const router: IRouter = Router();

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

const scriptSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  messages: z.array(messageSchema).min(1),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  response_format: z.unknown().optional(),
});

const imageSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  prompt: z.string().min(1),
  negative_prompt: z.string().optional(),
  seed: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  steps: z.number().optional(),
  n: z.number().optional(),
  response_format: z.string().optional(),
});

// Returns true when the given IP literal falls in a private, loopback,
// link-local, or otherwise non-public range (IPv4 or IPv6).
function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const parts = ip.split(".").map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (v === 6) {
    let h = ip.toLowerCase();
    // Strip zone id and brackets if present.
    h = h.replace(/^\[/, "").replace(/\]$/, "").split("%")[0];
    if (h === "::" || h === "::1") return true; // unspecified / loopback
    if (h.startsWith("fe80")) return true; // link-local
    if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique local
    if (h.startsWith("ff")) return true; // multicast
    // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded IPv4.
    const mapped = h.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  // Not a recognizable IP literal.
  return true;
}

// SSRF guard: only allow https endpoints whose hostname resolves entirely to
// public IP addresses. Resolving DNS here defeats public-looking domains that
// point at internal targets (DNS rebinding / malicious DNS).
async function isAllowedBaseUrl(raw: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;

  // If the host is already an IP literal, check it directly.
  if (isIP(host) || isIP(host.replace(/^\[/, "").replace(/\]$/, ""))) {
    return !isPrivateIp(host.replace(/^\[/, "").replace(/\]$/, ""));
  }

  // Require a dotted host so bare internal names are rejected.
  if (!host.includes(".")) return false;

  // Resolve every address the host maps to and require all to be public.
  try {
    const addresses = await lookup(host, { all: true });
    if (addresses.length === 0) return false;
    return addresses.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, "") + path;
}

async function forward(
  targetUrl: string,
  apiKey: string,
  payload: unknown,
  timeoutMs: number,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await upstream.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { error: text };
    }
    return { status: upstream.status, body };
  } finally {
    clearTimeout(timer);
  }
}

router.post("/ai/script", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to use AI generation." });
    return;
  }

  const parsed = scriptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const { baseUrl, apiKey, ...rest } = parsed.data;
  if (!(await isAllowedBaseUrl(baseUrl))) {
    res.status(400).json({ error: "Provider URL must be a public https endpoint." });
    return;
  }

  try {
    const result = await forward(
      joinUrl(baseUrl, "/chat/completions"),
      apiKey,
      rest,
      120_000,
    );
    res.status(result.status).json(result.body);
  } catch (err) {
    req.log.error({ err }, "AI script proxy failed");
    res.status(502).json({ error: "Could not reach the AI provider." });
  }
});

router.post("/ai/image", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to use AI generation." });
    return;
  }

  const parsed = imageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const { baseUrl, apiKey, ...rest } = parsed.data;
  if (!(await isAllowedBaseUrl(baseUrl))) {
    res.status(400).json({ error: "Provider URL must be a public https endpoint." });
    return;
  }

  try {
    const result = await forward(
      joinUrl(baseUrl, "/images/generations"),
      apiKey,
      rest,
      180_000,
    );
    res.status(result.status).json(result.body);
  } catch (err) {
    req.log.error({ err }, "AI image proxy failed");
    res.status(502).json({ error: "Could not reach the AI provider." });
  }
});

// ---- ElevenLabs character speech (server-key) ----
// Unlike the bring-your-own-key script/image routes, speech uses the app's own
// ElevenLabs key from the environment, so the host is fixed (no SSRF surface).
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
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to use character voices." });
    return;
  }
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
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to use character voices." });
    return;
  }
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
