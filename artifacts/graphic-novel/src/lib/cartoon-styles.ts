export const CARTOON_STYLES = [
  { id: 'cel', label: 'Cel animation', prompt: 'hand-drawn cel animation, clean outlines, expressive shapes, bright colors and crisp cel shading' },
  { id: 'anime', label: 'Anime', prompt: 'color anime illustration, expressive linework, detailed backgrounds and soft cel shading' },
  { id: 'manga', label: 'Manga monochrome', prompt: 'black and white manga ink drawing, expressive line art, screentone shading and crosshatching' },
  { id: 'comic', label: 'Comic book', prompt: 'classic comic book illustration, bold ink outlines, dramatic shadows and halftone color' },
  { id: 'newspaper', label: 'Newspaper comic', prompt: 'newspaper comic strip drawing, economical ink lines, simple expressive forms and muted flat colors' },
  { id: 'watercolor', label: 'Watercolor storybook', prompt: 'watercolor storybook illustration, delicate brushwork, paper texture and soft washes' },
  { id: 'vector', label: 'Flat vector', prompt: 'flat vector cartoon illustration, smooth geometric shapes, solid color blocks and clean edges' },
  { id: 'pop', label: 'Pop art', prompt: 'pop art cartoon illustration, bold flat colors, graphic contours and halftone dots' },
  { id: 'pencil', label: 'Pencil', prompt: 'hand-drawn pencil cartoon sketch, graphite shading and expressive strokes on paper' },
  { id: 'charcoal', label: 'Charcoal', prompt: 'charcoal cartoon drawing, textured charcoal strokes, tonal shading and paper grain' },
  { id: 'clay', label: 'Clay / 3D cartoon', prompt: 'clay-like 3D cartoon illustration, rounded sculpted forms, tactile surface and soft studio lighting' },
  { id: 'pixel', label: 'Pixel art', prompt: 'pixel art cartoon, crisp blocky pixels, limited color palette and deliberate dithering' },
  { id: 'noir', label: 'Noir comic', prompt: 'noir comic illustration, black and white ink, stark chiaroscuro and deep dramatic shadows' },
  { id: 'custom', label: 'Custom style', prompt: '' },
] as const;

export function cartoonPrompt(id: string, custom = ''): string {
  const style = CARTOON_STYLES.find(item => item.id === id);
  if (!style) throw new Error('Choose a supported cartoon style.');
  const description = (id === 'custom' ? custom : style.prompt).trim();
  if (!description) throw new Error('Describe your custom cartoon style.');
  return `Transform the supplied image into a ${description}. Preserve the recognizable subjects, facial features, poses, objects, setting, framing and composition of the input image. Change the visual medium, not the content. Do not add text or watermarks.`;
}