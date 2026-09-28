import { STYLE_PRESETS, type StylePreset } from './style-presets';
import { convertTextToNovel, type GeneratedPanel, type ConvertProgress } from './ai-client';
import { dbApi, type Panel, type Project } from './db';
export const COMIC_NOTES = 'Adapt the entire source argument faithfully into exactly four sequential panels: the individual-drive hypothesis; conformity and collective intelligence; the cell/organism analogy; and the conclusion that group psychology is primary. Use brief, readable captions. For film noir, use very short attributed exchanges (no long speeches), clear enough to fit one balloon per panel. Do not misrepresent the essay as an empirical proof or invent historical events.';

// A blank custom preset is not a defined drawing style. If it ever acquires a
// concrete prompt, it joins the test automatically. Photo styles stay out.
export function comicStyles(presets: StylePreset[] = STYLE_PRESETS): StylePreset[] {
  return presets.filter(style => !!style.prompt.trim());
}

export type ComicStatus = 'pending' | 'running' | 'passed' | 'failed' | 'cancelled';
export interface ComicResult {
  styleId: string;
  status: ComicStatus;
  projectId?: string;
  error?: string;
}
export interface ComicReport {
  runId: string;
  createdAt: number;
  results: ComicResult[];
}

export function newComicReport(styles = comicStyles()): ComicReport {
  return {
    runId: crypto.randomUUID(),
    createdAt: Date.now(),
    results: styles.map(style => ({ styleId: style.id, status: 'pending' })),
  };
}

export function eligibleComicStyles(report: ComicReport, styles = comicStyles(), retry = false) {
  return styles.filter(style => {
    const result = report.results.find(item => item.styleId === style.id);
    return result && (retry ? (result.status === 'failed' || result.status === 'cancelled') : result.status === 'pending');
  });
}

export interface ComicDependencies {
  convert: typeof convertTextToNovel;
  save: typeof dbApi.createGeneratedProject;
  read: typeof dbApi.getPanels;
}

const realDependencies: ComicDependencies = {
  convert: convertTextToNovel,
  save: (...args) => dbApi.createGeneratedProject(...args),
  read: (...args) => dbApi.getPanels(...args),
};

async function validateImage(blob: Blob) {
  if (!(blob instanceof Blob) || !blob.size || !blob.type.startsWith('image/')) {
    throw new Error('Provider returned an empty or non-image panel.');
  }
  // A MIME header alone is insufficient; verify the bytes can actually decode.
  const bitmap = await createImageBitmap(blob);
  try {
    if (!bitmap.width || !bitmap.height) throw new Error('Image has no dimensions.');
  } finally {
    bitmap.close?.();
  }
}

export async function runComicStyles(
  initial: ComicReport,
  styles: StylePreset[],
  sourceText: string,
  signal: AbortSignal,
  update: (report: ComicReport, style: StylePreset, progress?: ConvertProgress) => void,
  dependencies: ComicDependencies = realDependencies,
): Promise<ComicReport> {
  let report = initial;
  const set = (style: StylePreset, patch: Partial<ComicResult>, progress?: ConvertProgress) => {
    report = {
      ...report,
      results: report.results.map(result => result.styleId === style.id ? { ...result, ...patch } : result),
    };
    update(report, style, progress);
  };
  // Deliberately serial: no overlapping provider requests across styles.
  for (const style of styles) {
    if (signal.aborted) break;
    if (!eligibleComicStyles(report, [style], true).length &&
        !eligibleComicStyles(report, [style], false).length) continue;
    set(style, { status: 'running', error: undefined });
    try {
      const existingId = report.results.find(result => result.styleId === style.id)?.projectId;
      if (existingId) {
        const existing = await dependencies.read(existingId);
        if (existing.length !== 4) throw new Error(`Saved project has ${existing.length} panels, not four; inspect it in Projects. No regeneration attempted.`);
        for (const panel of existing) await validateImage(panel.imageBlob);
        set(style, { status: 'passed' });
        continue;
      }
      const panels: GeneratedPanel[] = await dependencies.convert({
        mode: 'standard',
        sourceText,
        outputSpec: COMIC_NOTES,
        style,
        customStyle: style.id === 'custom' ? style.prompt : '',
        panelCount: 4,
        signal,
        onProgress: progress => update(report, style, progress),
      });
      signal.throwIfAborted();
      if (panels.length !== 4) throw new Error(`Expected exactly four panels, got ${panels.length}. Nothing was saved.`);
      for (const panel of panels) await validateImage(panel.imageBlob);
      signal.throwIfAborted();
      const project: Project = await dependencies.save(
        `All Styles Comic Test ${report.runId.slice(0, 8)} — ${style.label}`,
        panels.map(panel => ({ imageBlob: panel.imageBlob, caption: panel.caption, durationSeconds: 4 })),
        undefined,
        style.id === 'film-noir' ? { layout: 'film-noir', pageTitle: 'The Individual and the Group' } : undefined,
      );
      // Preserve the project reference even if a subsequent read fails: a
      // retry must not pay for a second copy of an already committed project.
      set(style, { projectId: project.id, status: 'running' });
      const saved: Panel[] = await dependencies.read(project.id);
      if (saved.length !== 4) throw new Error(`Saved project has ${saved.length} panels, not four.`);
      for (const panel of saved) await validateImage(panel.imageBlob);
      set(style, { status: 'passed' });
    } catch (error) {
      set(style, {
        status: signal.aborted ? 'cancelled' : 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      if (signal.aborted) break;
    }
  }
  return report;
}