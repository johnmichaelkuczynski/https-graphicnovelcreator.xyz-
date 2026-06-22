export interface AiSettings {
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  imageModel: string;
}

export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  chatModel: string;
  imageModel: string;
  note: string;
}

// OpenAI-compatible providers. Models are editable because provider model ids
// change over time — these are sensible starting points only.
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'venice',
    label: 'Venice AI',
    baseUrl: 'https://api.venice.ai/api/v1',
    chatModel: 'llama-3.3-70b',
    imageModel: 'flux-dev',
    note: 'Does both text and images. Get a key at venice.ai.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    chatModel: 'gpt-4o-mini',
    imageModel: 'gpt-image-1',
    note: 'Uses your OpenAI key. dall-e-3 also works as an image model.',
  },
];

export const DEFAULT_SETTINGS: AiSettings = {
  baseUrl: PROVIDER_PRESETS[0].baseUrl,
  apiKey: '',
  chatModel: PROVIDER_PRESETS[0].chatModel,
  imageModel: PROVIDER_PRESETS[0].imageModel,
};

const STORAGE_KEY = 'novel-ai-settings';

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAiSettings(settings: AiSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota / private-mode errors
  }
}
