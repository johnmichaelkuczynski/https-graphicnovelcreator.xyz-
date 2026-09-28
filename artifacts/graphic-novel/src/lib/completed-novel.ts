import { dbApi, type Project } from '@/lib/db';

// This module is only called from the development-only Studio affordance.
// The generated artwork lives outside Vite's public directory and is fetched
// only when the visitor explicitly opens the completed novel.
const IMPORT_KEY = 'gnc:dev-completed-novel:group-psychology';
const DATA_URL = `${import.meta.env.BASE_URL}__dev/completed-novel/group-psychology.json`;

interface CompletedNovelData {
  project: { layout: 'film-noir'; pageTitle: string };
  panels: {
    caption: string;
    durationSeconds: number;
    order: number;
    imageDataUrl: string;
  }[];
}

let pendingImport: Promise<Project> | null = null;

async function loadCompletedNovel(): Promise<Project> {
  const savedId = localStorage.getItem(IMPORT_KEY);
  if (savedId) {
    const existing = (await dbApi.getProjects()).find((project) => project.id === savedId);
    if (existing) return existing;
  }

  const response = await fetch(DATA_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load the completed novel (${response.status}).`);
  const data: CompletedNovelData = await response.json();
  if (
    data.project?.layout !== 'film-noir' ||
    !Array.isArray(data.panels) ||
    data.panels.length !== 10 ||
    data.panels.some((panel, index) =>
      panel.order !== index ||
      typeof panel.caption !== 'string' ||
      !Number.isFinite(panel.durationSeconds) ||
      !panel.imageDataUrl?.startsWith('data:image/png;base64,'))
  ) {
    throw new Error('The completed novel data is incomplete or invalid.');
  }

  const panels = await Promise.all(data.panels.map(async (panel) => ({
    imageBlob: await (await fetch(panel.imageDataUrl)).blob(),
    caption: panel.caption,
    durationSeconds: panel.durationSeconds,
  })));
  // One IndexedDB transaction commits the project and all ten panels; existing
  // user projects are never cleared or modified.
  const project = await dbApi.createGeneratedProject('Group Psychology', panels, undefined, {
    layout: data.project.layout,
    pageTitle: data.project.pageTitle,
  });
  localStorage.setItem(IMPORT_KEY, project.id);
  return project;
}

export function openCompletedNovel(): Promise<Project> {
  if (!pendingImport) {
    pendingImport = loadCompletedNovel().finally(() => { pendingImport = null; });
  }
  return pendingImport;
}