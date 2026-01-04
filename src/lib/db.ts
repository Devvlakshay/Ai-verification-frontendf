// src/lib/db.ts
const DB_NAME = 'AI_Verification_DB';
const STORE_NAME = 'kyc_data';
const DB_VERSION = 1;

// Cache DB connection to avoid reopening
let dbInstance: IDBDatabase | null = null;

export const initDB = (): Promise<IDBDatabase> => {
  if (typeof window === 'undefined') return Promise.resolve(null as any);
  
  // Return cached instance if available
  if (dbInstance) return Promise.resolve(dbInstance);
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

export const saveToDB = async (key: string, value: any) => {
  if (typeof window === 'undefined') return;
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getFromDB = async (key: string) => {
  if (typeof window === 'undefined') return null;
  const db = await initDB();
  return new Promise<any>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null); // Return null on error/not found
  });
};

export const clearDB = async () => {
    if (typeof window === 'undefined') return;
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear().onsuccess = () => resolve();
    });
};

/**
 * Close the database connection and clear cache
 * Call this when leaving the app to free memory
 */
export const closeDB = () => {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
};