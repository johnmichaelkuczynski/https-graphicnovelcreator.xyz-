export interface Voice {
  voiceId: string;
  name: string;
  category?: string;
}

const VOICES_URL = '/api/ai/voices';
const TTS_URL = '/api/ai/tts';

export async function fetchVoices(): Promise<Voice[]> {
  const res = await fetch(VOICES_URL);
  if (!res.ok) {
    let msg = 'Could not load voices.';
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as { voices: Voice[] };
  return data.voices ?? [];
}

export async function generateSpeech(text: string, voiceId: string): Promise<Blob> {
  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceId }),
  });
  if (!res.ok) {
    let msg = 'Speech generation failed.';
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.blob();
}
