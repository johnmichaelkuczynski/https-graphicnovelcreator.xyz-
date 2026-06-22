import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Panel {
  id: string;
  imageBlob: Blob;
  caption: string;
  durationSeconds: number;
  order: number;
}

export interface AudioTrack {
  id: string;
  audioBlob: Blob;
  name: string;
  order: number;
}

interface NovelDBSchema extends DBSchema {
  panels: {
    key: string;
    value: Panel;
    indexes: { 'by-order': number };
  };
  audio_tracks: {
    key: string;
    value: AudioTrack;
    indexes: { 'by-order': number };
  };
}

let dbPromise: Promise<IDBPDatabase<NovelDBSchema>>;

export async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<NovelDBSchema>('novel-creator-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('panels')) {
          const panelStore = db.createObjectStore('panels', { keyPath: 'id' });
          panelStore.createIndex('by-order', 'order');
        }
        if (!db.objectStoreNames.contains('audio_tracks')) {
          const audioStore = db.createObjectStore('audio_tracks', { keyPath: 'id' });
          audioStore.createIndex('by-order', 'order');
        }
      },
    });
  }
  return dbPromise;
}

export const dbApi = {
  async getPanels(): Promise<Panel[]> {
    const db = await getDB();
    const panels = await db.getAllFromIndex('panels', 'by-order');
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

  async getAudioTracks(): Promise<AudioTrack[]> {
    const db = await getDB();
    const tracks = await db.getAllFromIndex('audio_tracks', 'by-order');
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

  async clearAll(): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(['panels', 'audio_tracks'], 'readwrite');
    await tx.objectStore('panels').clear();
    await tx.objectStore('audio_tracks').clear();
    await tx.done;
  },

  async replaceAll(panels: Panel[], tracks: AudioTrack[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(['panels', 'audio_tracks'], 'readwrite');
    const panelStore = tx.objectStore('panels');
    const audioStore = tx.objectStore('audio_tracks');
    await panelStore.clear();
    await audioStore.clear();
    for (const p of panels) await panelStore.put(p);
    for (const t of tracks) await audioStore.put(t);
    await tx.done;
  }
};
