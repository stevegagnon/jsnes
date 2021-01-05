import { openDB, DBSchema, IDBPDatabase } from 'idb';

let db: IDBPDatabase<MyDB>;

interface MyDB extends DBSchema {
  roms: {
    value: ArrayBuffer,
    key: string,
  },
  snapshots: {
    value: any,
    key: string
  }
}

async function getDb(): Promise<IDBPDatabase<MyDB>> {
  if (!db) {
    db = await openDB<MyDB>('polyrom', 1, {
      upgrade(db, oldVersion, newVersion, transaction) {
        const roms = db.createObjectStore('roms');
        const snapshots = db.createObjectStore('snapshots');
      }
    });
  }

  return db;
}

export async function fetchRom(name: string) {
  const db = await getDb();
  const rom = await db.get('roms', name);

  if (!rom) {
    const response = await fetch(`roms/${name}`);

    if (response.ok) {
      const data = await response.arrayBuffer();
      await db.add('roms', data, name);
      return data;
    }

    throw new Error('could not load rom');
  }

  return rom;
}

type RomManifest = Array<string>;

export async function cacheRoms(manifest: RomManifest) {
  for (const name of manifest) {
    await fetchRom(name);
  }
}

export function saveSnapshot(key: string, snapshot: any): Promise<unknown> {
  return db.add('snapshots', snapshot, key);
}

export  function fetchSnapshot(key: string): Promise<any> {
  return db.add('snapshots', key);
}
