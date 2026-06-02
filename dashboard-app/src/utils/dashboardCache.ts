// Cache local (IndexedDB) dos dados do dashboard — cards e sessões.
// Objetivo: depois do 1º carregamento, reabrir o dashboard é INSTANTÂNEO
// (lê do cache) e o fetch fresco roda em segundo plano. Se o Supabase estiver
// lento/saturado, o cache segura a tela (nunca mais "0" nem loop de loading).
// IndexedDB (não localStorage) porque são dezenas de milhares de linhas (MBs).

const DB_NAME = 'lawchat-dashboard-cache';
const STORE = 'kv';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e as any);
    }
  });
  return dbPromise;
}

export async function cacheGet<T = any>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result ?? null) as T | null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: any): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    /* ignora — cache é best-effort */
  }
}

export const cardsKey = (clientId?: string) => `cards:${clientId || 'default'}`;
export const sessionsKey = (clientId?: string) => `sessions:${clientId || 'default'}`;
