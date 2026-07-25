// Shared validation for user-uploaded audio (WAV/MP3 and other common
// browser-playable formats), applied everywhere a user can attach audio.
// All audio stays client-side in IndexedDB, so the limit exists to keep
// projects exportable and the browser DB healthy — "within reason".

export const MAX_AUDIO_MB = 25;
export const AUDIO_ACCEPT = ".mp3,.wav,.m4a,.ogg,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg";

const OK_EXTENSIONS = [".mp3", ".wav", ".m4a", ".ogg"];

export function validateAudioFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const typeOk = file.type.startsWith("audio/");
  const extOk = OK_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!typeOk && !extOk) {
    return `"${file.name}" isn't a supported audio file. Use MP3 or WAV (M4A/OGG also work).`;
  }
  if (file.size > MAX_AUDIO_MB * 1024 * 1024) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `"${file.name}" is ${mb} MB — the limit is ${MAX_AUDIO_MB} MB per audio file.`;
  }
  return null;
}
