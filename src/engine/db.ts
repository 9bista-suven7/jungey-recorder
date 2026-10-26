// Boards (projects). On desktop each board is a JSON file in the app's data folder (portable,
// easy to back up, the same in dev and installed builds). In a plain browser, IndexedDB.
import type { Project } from '../types';
import { bridge } from '../platform';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    // Named before the app was renamed to Jungey Recorder; renaming it would lose saved boards.
    const req = indexedDB.open('jungey-blackboard', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('projects')) req.result.createObjectStore('projects', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction('projects', mode).objectStore('projects'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const idb = {
  put: (p: Project) => run('readwrite', (s) => s.put(p)),
  remove: (id: string) => run('readwrite', (s) => s.delete(id)),
  all: () => run<Project[]>('readonly', (s) => s.getAll()),
};

const files = bridge.projects;
let migrated: Promise<void> | null = null;

/** Boards saved by older versions live in IndexedDB; copy any the files don't have yet. */
function migrate() {
  migrated ??= (async () => {
    if (!files) return;
    const [onDisk, old] = await Promise.all([files.list(), idb.all().catch(() => [] as Project[])]);
    const have = new Set(onDisk.map((p) => p.id));
    for (const p of old) if (!have.has(p.id)) await files.put(p);
  })().catch((e) => console.error('moving boards to files failed', e));
  return migrated;
}

export const projectsDb = {
  put: (p: Project) => (files ? files.put(p) : idb.put(p)),
  remove: (id: string) => (files ? files.remove(id) : idb.remove(id)),
  all: async () => {
    await migrate();
    const list = files ? await files.list() : await idb.all();
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  },
};
