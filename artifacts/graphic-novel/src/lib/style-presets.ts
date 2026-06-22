export interface StylePreset {
  id: string;
  label: string;
  hint: string;
  // Style instruction appended IDENTICALLY to every panel's image prompt so the
  // drawing style never changes across panels.
  prompt: string;
  // Cost/size hints sent to the image model. "Token-light" presets use smaller
  // images and fewer steps so generating a whole novel stays cheap.
  image: { width: number; height: number; steps: number };
  tokenLight?: boolean;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'stick',
    label: 'Stick Figure — token-light',
    hint: 'Cheapest. Crude black-and-white stick people, fastest to generate.',
    prompt:
      'extremely minimalist black stick-figure line drawing, simple stick people with plain circle heads and straight-line limbs, thick black outlines on a solid plain white background, no shading, no gradients, no color, no background detail, crude hand-drawn xkcd webcomic look',
    image: { width: 768, height: 768, steps: 8 },
    tokenLight: true,
  },
  {
    id: 'comic',
    label: 'Classic Comic Book',
    hint: 'Bold ink outlines, halftone shading, vibrant colors.',
    prompt:
      'classic american comic book art, bold heavy black ink outlines, halftone dot shading, vibrant saturated colors, dramatic cel shading, dynamic comic panel composition',
    image: { width: 1024, height: 1024, steps: 25 },
  },
  {
    id: 'manga',
    label: 'Manga / Anime (B&W)',
    hint: 'Black-and-white manga with screentones.',
    prompt:
      'black and white japanese manga art, clean ink linework, screentone shading, expressive anime faces, detailed crosshatching, monochrome',
    image: { width: 896, height: 1152, steps: 25 },
  },
  {
    id: 'anime',
    label: 'Anime (Color)',
    hint: 'Soft colored anime illustration.',
    prompt:
      'colored anime illustration, soft cel shading, clean linework, expressive characters, vibrant but soft palette, detailed anime background',
    image: { width: 1024, height: 1024, steps: 25 },
  },
  {
    id: 'watercolor',
    label: 'Watercolor Storybook',
    hint: 'Soft painterly children-book look.',
    prompt:
      'soft watercolor storybook illustration, gentle washes of color, visible paper texture, hand-painted, warm whimsical childrens-book style, delicate brushwork',
    image: { width: 1024, height: 1024, steps: 28 },
  },
  {
    id: 'noir',
    label: 'Ink Noir (High Contrast B&W)',
    hint: 'Stark black-and-white, heavy shadows.',
    prompt:
      'high contrast black and white noir ink illustration, dramatic chiaroscuro lighting, deep heavy shadows, stark whites, gritty graphic novel inking, moody atmosphere',
    image: { width: 1024, height: 1024, steps: 25 },
  },
  {
    id: 'pixel',
    label: 'Retro Pixel Art',
    hint: '16-bit video game look.',
    prompt:
      'retro 16-bit pixel art, limited color palette, crisp dithering, video game sprite scene, blocky pixelated rendering',
    image: { width: 1024, height: 1024, steps: 22 },
  },
  {
    id: 'cinematic',
    label: 'Cinematic Realism',
    hint: 'Photoreal, film-still look (more tokens).',
    prompt:
      'cinematic photorealistic concept art, dramatic film lighting, detailed textures, depth of field, realistic proportions, movie still composition',
    image: { width: 1024, height: 1024, steps: 30 },
  },
  {
    id: 'custom',
    label: 'Custom — describe your own',
    hint: 'Type exactly how every panel should be drawn.',
    prompt: '',
    image: { width: 1024, height: 1024, steps: 25 },
  },
];

export function getStylePreset(id: string): StylePreset {
  return STYLE_PRESETS.find((p) => p.id === id) ?? STYLE_PRESETS[0];
}
