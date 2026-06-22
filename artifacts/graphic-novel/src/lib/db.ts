import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface Panel {
  id: string;
  projectId: string;
  imageBlob: Blob;
  caption: string;
  durationSeconds: number;
  order: number;
}

export interface AudioTrack {
  id: string;
  projectId: string;
  audioBlob: Blob;
  name: string;
  order: number;
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
}

let dbPromise: Promise<IDBPDatabase<NovelDBSchema>>;

export async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<NovelDBSchema>('novel-creator-db', 2, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains('panels')) {
          const panelStore = db.createObjectStore('panels', { keyPath: 'id' });
          panelStore.createIndex('by-order', 'order');
        }
        if (!db.objectStoreNames.contains('audio_tracks')) {
          const audioStore = db.createObjectStore('audio_tracks', { keyPath: 'id' });
          audioStore.createIndex('by-order', 'order');
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
  }
  return dbPromise;
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

  // Wipes ALL projects, panels and audio. Used when the signed-in user changes
  // on a shared browser so one account can never see another's local content.
  async clearAllData(): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(['projects', 'panels', 'audio_tracks'], 'readwrite');
    await tx.objectStore('projects').clear();
    await tx.objectStore('panels').clear();
    await tx.objectStore('audio_tracks').clear();
    await tx.done;
  },
};
