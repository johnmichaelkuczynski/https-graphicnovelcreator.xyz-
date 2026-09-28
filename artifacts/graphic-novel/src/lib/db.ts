import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  layout?: 'film-noir';
  pageTitle?: string;
}

// A panel shows 1 image by default. Users may add up to MAX_PANEL_IMAGES total.
// The first image always lives in `imageBlob` (so every reader that predates
// multi-image still shows something and no IndexedDB migration is needed);
// images 2..N live in the optional `extraImages` array.
export const MAX_PANEL_IMAGES = 8;

export interface Panel {
  id: string;
  projectId: string;
  imageBlob: Blob;
  // Additional images beyond the first (up to MAX_PANEL_IMAGES - 1). Optional:
  // a normal single-image panel simply omits it.
  extraImages?: Blob[];
  caption: string;
  durationSeconds: number;
  order: number;
  // Optional audio attached to this single panel (sound effect / narration /
  // music / generated character speech). Plays during this panel, layered over
  // any sequence-wide tracks.
  audioBlob?: Blob;
  audioName?: string;
  // Last ElevenLabs voice used to voice this panel's character, so the choice
  // persists between speech regenerations.
  voiceId?: string;
}

export interface AudioTrack {
  id: string;
  projectId: string;
  audioBlob: Blob;
  name: string;
  order: number;
}

// ---- Reusable libraries (global, NOT scoped to a project) ----
// These let the user upload/write something once and reuse it across every
// project, instead of re-finding the same file or re-typing the same prompt.

export interface LibraryImage {
  id: string;
  name: string;
  imageBlob: Blob;
  createdAt: number;
}

export interface LibraryDocument {
  id: string;
  name: string;
  // Extracted plain text, ready to drop into the converter's source field.
  text: string;
  // The original uploaded file, kept so the user can re-download it later.
  fileBlob?: Blob;
  createdAt: number;
}

export interface LibraryInstruction {
  id: string;
  title: string;
  // The reusable "turn it into…" prompt for generating a graphic novel.
  text: string;
  createdAt: number;
}

interface NovelDBSchema extends DBSchema {
  projects: {
    key: string;
    value: Project;
  };
  panels: {
    key: string;
    value: Panel;
    indexes: { 'by-order': number; 'by-project': string };
  };
  audio_tracks: {
    key: string;
    value: AudioTrack;
    indexes: { 'by-order': number; 'by-project': string };
  };
  library_images: {
    key: string;
    value: LibraryImage;
  };
  library_documents: {
    key: string;
    value: LibraryDocument;
  };
  library_instructions: {
    key: string;
    value: LibraryInstruction;
  };
}

// Returns every image of a panel in display order: the primary `imageBlob`
// followed by any `extraImages`. Single source of truth for "what images does
// this panel have" used by the grid, slideshow, PDF and video.
export function getPanelImages(panel: Pick<Panel, 'imageBlob' | 'extraImages'>): Blob[] {
  return ([panel.imageBlob, ...(panel.extraImages ?? [])].filter(Boolean) as Blob[]).slice(
    0,
    MAX_PANEL_IMAGES,
  );
}

const LEGACY_DB = 'novel-creator-db';
let activeDBName: string | null = null;
const connections = new Map<string, Promise<IDBPDatabase<NovelDBSchema>>>();

// The caller must establish the authenticated storage partition before any
// project query runs. Never silently fall back to the unscoped legacy database.
export function selectDataScope(userId: string, preview = false) {
  activeDBName = preview ? LEGACY_DB : `${LEGACY_DB}-user-${encodeURIComponent(userId)}`;
}

export function getProjectSelectionKey(userId: string, preview = false) {
  return preview ? 'novel-current-project-id' : `novel-current-project-id:user:${encodeURIComponent(userId)}`;
}

export async function getDB() {
  if (!activeDBName) throw new Error('Project storage is not ready. Please reload after signing in.');
  return openNovelDB(activeDBName);
}

function openNovelDB(name: string): Promise<IDBPDatabase<NovelDBSchema>> {
  if (!connections.has(name)) {
    const opening = openDB<NovelDBSchema>(name, 5, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains('panels')) {
          const panelStore = db.createObjectStore('panels', { keyPath: 'id' });
          panelStore.createIndex('by-order', 'order');
        }
        if (!db.objectStoreNames.contains('audio_tracks')) {
          const audioStore = db.createObjectStore('audio_tracks', { keyPath: 'id' });
          audioStore.createIndex('by-order', 'order');
        }

        // v5: reusable global libraries. Plain id-keyed stores — no migration of
        // existing data is needed because they start empty.
        if (!db.objectStoreNames.contains('library_images')) {
          db.createObjectStore('library_images', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('library_documents')) {
          db.createObjectStore('library_documents', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('library_instructions')) {
          db.createObjectStore('library_instructions', { keyPath: 'id' });
        }

        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('projects')) {
            db.createObjectStore('projects', { keyPath: 'id' });
          }

          const panelStore = tx.objectStore('panels');
          if (!panelStore.indexNames.contains('by-project')) {
            panelStore.createIndex('by-project', 'projectId');
          }
          const audioStore = tx.objectStore('audio_tracks');
          if (!audioStore.indexNames.contains('by-project')) {
            audioStore.createIndex('by-project', 'projectId');
          }

          // Migrate any pre-existing single-project data into a default project.
          const existingPanels = await panelStore.getAll();
          const existingTracks = await audioStore.getAll();
          if (existingPanels.length > 0 || existingTracks.length > 0) {
            const defaultId = crypto.randomUUID();
            const now = Date.now();
            await tx.objectStore('projects').put({
              id: defaultId,
              name: 'My First Project',
              createdAt: now,
              updatedAt: now,
            });
            for (const p of existingPanels) {
              await panelStore.put({ ...p, projectId: (p as Panel).projectId ?? defaultId });
            }
            for (const t of existingTracks) {
              await audioStore.put({ ...t, projectId: (t as AudioTrack).projectId ?? defaultId });
            }
          }
        }
      },
    });
    connections.set(name, opening);
    opening.catch(() => { if (connections.get(name) === opening) connections.delete(name); });
  }
  return connections.get(name)!;
}

// Copy, never move or delete: old locally saved novels remain recoverable if
// the browser runs out of space during migration. Only the *known* prior owner
// of the unscoped DB may import it; an unknown owner must not be guessed.
export async function migrateLegacyData(userId: string): Promise<void> {
  const target = await openNovelDB(`${LEGACY_DB}-user-${encodeURIComponent(userId)}`);
  const source = await openNovelDB(LEGACY_DB);
  const stores = ['projects', 'panels', 'audio_tracks', 'library_images', 'library_documents', 'library_instructions'] as const;
  const records = await Promise.all(stores.map((store) => source.getAll(store)));
  const tx = target.transaction(stores, 'readwrite');
  void tx.done.catch(() => {}); // The explicit abort path throws the original write error.
  try {
    // Import only if this partition has not already been used. Do not revive
    // old projects a user deliberately deleted after a previous import.
    if (await tx.objectStore('projects').count() || await tx.objectStore('panels').count() ||
        await tx.objectStore('audio_tracks').count()) {
      await tx.done;
      return;
    }
    for (let i = 0; i < stores.length; i++) {
      const store = tx.objectStore(stores[i]);
      for (const record of records[i]) await store.put(record as never);
    }
    await tx.done;
  } catch (err) {
    try { tx.abort(); } catch { /* already aborted */ }
    throw err;
  }
}

export const dbApi = {
  // ---- Projects ----
  async getProjects(): Promise<Project[]> {
    const db = await getDB();
    const projects = await db.getAll('projects');
    return projects.sort((a, b) => a.createdAt - b.createdAt);
  },

  async createProject(name: string): Promise<Project> {
    const db = await getDB();
    const now = Date.now();
    const project: Project = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Untitled Project',
      createdAt: now,
      updatedAt: now,
    };
    await db.put('projects', project);
    return project;
  },

  // Commit a generated novel as one transaction: a failed write cannot leave
  // an empty/partially populated project in the switcher.
  async createGeneratedProject(
    name: string,
    panels: { imageBlob: Blob; caption: string; durationSeconds: number }[],
    audio?: { audioBlob: Blob; name: string },
    page?: { layout: 'film-noir'; pageTitle?: string },
  ): Promise<Project> {
    if (!panels.length) throw new Error('There are no generated panels to save.');
    const db = await getDB();
    const now = Date.now();
    const project: Project = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Untitled Project',
      createdAt: now,
      updatedAt: now,
      ...page,
    };
    const tx = db.transaction(['projects', 'panels', 'audio_tracks'], 'readwrite');
    void tx.done.catch(() => {}); // Prevent an abort from masking the write error.
    try {
      await tx.objectStore('projects').put(project);
      for (let i = 0; i < panels.length; i++) {
        await tx.objectStore('panels').put({
          id: crypto.randomUUID(), projectId: project.id,
          imageBlob: panels[i].imageBlob, caption: panels[i].caption,
          durationSeconds: panels[i].durationSeconds, order: i,
        });
      }
      if (audio) {
        await tx.objectStore('audio_tracks').put({
          id: crypto.randomUUID(), projectId: project.id, audioBlob: audio.audioBlob,
          name: audio.name, order: 0,
        });
      }
      await tx.done;
    } catch (err) {
      try { tx.abort(); } catch { /* transaction already finished or aborted */ }
      throw err;
    }
    return project;
  },

  async renameProject(id: string, name: string): Promise<void> {
    const db = await getDB();
    const project = await db.get('projects', id);
    if (project) {
      project.name = name.trim() || project.name;
      project.updatedAt = Date.now();
      await db.put('projects', project);
    }
  },

  async deleteProject(id: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(['projects', 'panels', 'audio_tracks'], 'readwrite');
    await tx.objectStore('projects').delete(id);

    const panelKeys = await tx.objectStore('panels').index('by-project').getAllKeys(id);
    for (const key of panelKeys) {
      await tx.objectStore('panels').delete(key);
    }
    const audioKeys = await tx.objectStore('audio_tracks').index('by-project').getAllKeys(id);
    for (const key of audioKeys) {
      await tx.objectStore('audio_tracks').delete(key);
    }
    await tx.done;
  },

  async touchProject(id: string): Promise<void> {
    const db = await getDB();
    const project = await db.get('projects', id);
    if (project) {
      project.updatedAt = Date.now();
      await db.put('projects', project);
    }
  },

  // ---- Panels ----
  async getPanels(projectId: string): Promise<Panel[]> {
    const db = await getDB();
    const panels = await db.getAllFromIndex('panels', 'by-project', projectId);
    return panels.sort((a, b) => a.order - b.order);
  },

  async savePanel(panel: Panel): Promise<void> {
    const db = await getDB();
    await db.put('panels', panel);
  },

  async deletePanel(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('panels', id);
  },

  async updatePanelOrder(updates: { id: string; order: number }[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('panels', 'readwrite');
    for (const update of updates) {
      const panel = await tx.store.get(update.id);
      if (panel) {
        panel.order = update.order;
        await tx.store.put(panel);
      }
    }
    await tx.done;
  },

  // ---- Audio ----
  async getAudioTracks(projectId: string): Promise<AudioTrack[]> {
    const db = await getDB();
    const tracks = await db.getAllFromIndex('audio_tracks', 'by-project', projectId);
    return tracks.sort((a, b) => a.order - b.order);
  },

  async saveAudioTrack(track: AudioTrack): Promise<void> {
    const db = await getDB();
    await db.put('audio_tracks', track);
  },

  async deleteAudioTrack(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('audio_tracks', id);
  },

  async updateAudioTrackOrder(updates: { id: string; order: number }[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('audio_tracks', 'readwrite');
    for (const update of updates) {
      const track = await tx.store.get(update.id);
      if (track) {
        track.order = update.order;
        await tx.store.put(track);
      }
    }
    await tx.done;
  },

  async clearProject(projectId: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(['panels', 'audio_tracks'], 'readwrite');
    const panelKeys = await tx.objectStore('panels').index('by-project').getAllKeys(projectId);
    for (const key of panelKeys) await tx.objectStore('panels').delete(key);
    const audioKeys = await tx.objectStore('audio_tracks').index('by-project').getAllKeys(projectId);
    for (const key of audioKeys) await tx.objectStore('audio_tracks').delete(key);
    await tx.done;
  },

  // ---- Image library (global) ----
  async getLibraryImages(): Promise<LibraryImage[]> {
    const db = await getDB();
    const items = await db.getAll('library_images');
    return items.sort((a, b) => b.createdAt - a.createdAt);
  },

  async saveLibraryImage(item: LibraryImage): Promise<void> {
    const db = await getDB();
    await db.put('library_images', item);
  },

  async deleteLibraryImage(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('library_images', id);
  },

  // ---- Document library (global) ----
  async getLibraryDocuments(): Promise<LibraryDocument[]> {
    const db = await getDB();
    const items = await db.getAll('library_documents');
    return items.sort((a, b) => b.createdAt - a.createdAt);
  },

  async saveLibraryDocument(item: LibraryDocument): Promise<void> {
    const db = await getDB();
    await db.put('library_documents', item);
  },

  async deleteLibraryDocument(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('library_documents', id);
  },

  // ---- Instruction library (global) ----
  async getLibraryInstructions(): Promise<LibraryInstruction[]> {
    const db = await getDB();
    const items = await db.getAll('library_instructions');
    return items.sort((a, b) => b.createdAt - a.createdAt);
  },

  async saveLibraryInstruction(item: LibraryInstruction): Promise<void> {
    const db = await getDB();
    await db.put('library_instructions', item);
  },

  async deleteLibraryInstruction(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('library_instructions', id);
  },

  // Wipes ALL projects, panels, audio and libraries. Used when the signed-in
  // user changes on a shared browser so one account can never see another's
  // local content.
  async clearAllData(): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(
      ['projects', 'panels', 'audio_tracks', 'library_images', 'library_documents', 'library_instructions'],
      'readwrite',
    );
    await tx.objectStore('projects').clear();
    await tx.objectStore('panels').clear();
    await tx.objectStore('audio_tracks').clear();
    await tx.objectStore('library_images').clear();
    await tx.objectStore('library_documents').clear();
    await tx.objectStore('library_instructions').clear();
    await tx.done;
  },
};
