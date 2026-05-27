(function () {
  const DB_NAME = 'sanctum_vault';
  const DB_VERSION = 2;
  const STORE_NAME = 'kv';
  const BLOB_STORE_NAME = 'blobs';
  const MANAGED_PREFIX = 'sanctum';
  const MANAGED_EXACT = new Set(['sanctum_profile_name']);

  const native = {
    getItem: Storage.prototype.getItem.bind(window.localStorage),
    setItem: Storage.prototype.setItem.bind(window.localStorage),
    removeItem: Storage.prototype.removeItem.bind(window.localStorage),
    clear: Storage.prototype.clear.bind(window.localStorage),
    key: Storage.prototype.key.bind(window.localStorage),
    get length() { return window.localStorage.length; }
  };

  const cache = new Map();
  let db = null;
  let flushTimer = null;
  let pendingWrites = new Map();
  let pendingDeletes = new Set();
  let clearPending = false;
  let ready = false;
  let storageMode = 'initializing';
  let initializationError = '';

  function isManagedKey(key) {
    return typeof key === 'string' && (key.startsWith(MANAGED_PREFIX) || MANAGED_EXACT.has(key));
  }

  function readLegacyNativeEntries() {
    const entries = new Map();
    for (let i = 0; i < native.length; i += 1) {
      const key = native.key(i);
      if (!isManagedKey(key)) continue;
      const value = native.getItem(key);
      if (value != null) entries.set(key, value);
    }
    return entries;
  }

  function getReadableEntries() {
    return storageMode === 'localstorage-fallback' ? readLegacyNativeEntries() : cache;
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      if (!db) return;
      try {
        if (clearPending) {
          await new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME, BLOB_STORE_NAME], 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('IndexedDB clear failed'));
            tx.objectStore(STORE_NAME).clear();
            tx.objectStore(BLOB_STORE_NAME).clear();
          });
          clearPending = false;
          pendingWrites.clear();
          pendingDeletes.clear();
          return;
        }

        if (!pendingWrites.size && !pendingDeletes.size) return;

        const writes = Array.from(pendingWrites.entries());
        const deletes = Array.from(pendingDeletes.values());
        pendingWrites.clear();
        pendingDeletes.clear();

        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
          const store = tx.objectStore(STORE_NAME);
          writes.forEach(([key, value]) => store.put(value, key));
          deletes.forEach((key) => store.delete(key));
        });
      } catch (err) {
        console.warn('Sanctum storage flush failed', err);
      }
    }, 40);
  }

  function patchLocalStorage() {
    const proto = Storage.prototype;
    const originalGetItem = proto.getItem;
    const originalSetItem = proto.setItem;
    const originalRemoveItem = proto.removeItem;
    const originalClear = proto.clear;

    proto.getItem = function (key) {
      if (this === window.localStorage && isManagedKey(key)) {
        return cache.has(key) ? cache.get(key) : null;
      }
      return originalGetItem.call(this, key);
    };

    proto.setItem = function (key, value) {
      if (this === window.localStorage && isManagedKey(key)) {
        const stringValue = String(value);
        cache.set(key, stringValue);
        pendingDeletes.delete(key);
        pendingWrites.set(key, stringValue);
        scheduleFlush();
        return;
      }
      return originalSetItem.call(this, key, value);
    };

    proto.removeItem = function (key) {
      if (this === window.localStorage && isManagedKey(key)) {
        cache.delete(key);
        pendingWrites.delete(key);
        pendingDeletes.add(key);
        scheduleFlush();
        return;
      }
      return originalRemoveItem.call(this, key);
    };

    proto.clear = function () {
      if (this === window.localStorage) {
        Array.from(cache.keys()).forEach((key) => cache.delete(key));
        pendingWrites.clear();
        pendingDeletes.clear();
        clearPending = true;
        scheduleFlush();

        const nativeKeys = [];
        for (let i = 0; i < native.length; i += 1) {
          const key = native.key(i);
          if (isManagedKey(key)) nativeKeys.push(key);
        }
        nativeKeys.forEach((key) => native.removeItem(key));
        return;
      }
      return originalClear.call(this);
    };
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      let settled = false;
      req.onupgradeneeded = () => {
        const nextDb = req.result;
        if (!nextDb.objectStoreNames.contains(STORE_NAME)) {
          nextDb.createObjectStore(STORE_NAME);
        }
        if (!nextDb.objectStoreNames.contains(BLOB_STORE_NAME)) {
          nextDb.createObjectStore(BLOB_STORE_NAME);
        }
      };
      req.onblocked = () => {
        if (settled) return;
        settled = true;
        const err = new Error('Sanctum vault upgrade is blocked by another open tab or window.');
        err.code = 'SANCTUM_STORAGE_BLOCKED';
        reject(err);
      };
      req.onsuccess = () => {
        if (settled) {
          req.result.close();
          return;
        }
        settled = true;
        req.result.onversionchange = () => req.result.close();
        resolve(req.result);
      };
      req.onerror = () => {
        if (settled) return;
        settled = true;
        reject(req.error || new Error('IndexedDB unavailable'));
      };
    });
  }

  function loadAllFromDb() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      const valReq = store.getAll();
      tx.oncomplete = () => {
        const keys = req.result || [];
        const values = valReq.result || [];
        const out = new Map();
        keys.forEach((key, index) => out.set(String(key), values[index]));
        resolve(out);
      };
      tx.onerror = () => reject(tx.error || new Error('IndexedDB read failed'));
    });
  }

  async function waitForDb() {
    if (db) return db;
    if (window.SanctumStorageReady) {
      try {
        await window.SanctumStorageReady;
      } catch (err) {
        console.warn('Sanctum storage wait failed', err);
      }
    }
    return db;
  }

  async function putBlob(key, value) {
    const currentDb = await waitForDb();
    if (!currentDb || typeof key !== 'string' || !key) return false;

    try {
      await new Promise((resolve, reject) => {
        const tx = currentDb.transaction(BLOB_STORE_NAME, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB blob write failed'));
        tx.objectStore(BLOB_STORE_NAME).put(value, key);
      });
      return true;
    } catch (err) {
      console.warn(`Failed to persist blob for key "${key}"`, err);
      return false;
    }
  }

  async function getBlob(key) {
    const currentDb = await waitForDb();
    if (!currentDb || typeof key !== 'string' || !key) return null;

    try {
      return await new Promise((resolve, reject) => {
        const tx = currentDb.transaction(BLOB_STORE_NAME, 'readonly');
        const req = tx.objectStore(BLOB_STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error || new Error('IndexedDB blob read failed'));
      });
    } catch (err) {
      console.warn(`Failed to read blob for key "${key}"`, err);
      return null;
    }
  }

  async function removeBlob(key) {
    const currentDb = await waitForDb();
    if (!currentDb || typeof key !== 'string' || !key) return false;

    try {
      await new Promise((resolve, reject) => {
        const tx = currentDb.transaction(BLOB_STORE_NAME, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB blob delete failed'));
        tx.objectStore(BLOB_STORE_NAME).delete(key);
      });
      return true;
    } catch (err) {
      console.warn(`Failed to delete blob for key "${key}"`, err);
      return false;
    }
  }

  async function primeCache() {
    db = await openDb();
    const dbEntries = await loadAllFromDb();

    if (dbEntries.size > 0) {
      dbEntries.forEach((value, key) => cache.set(key, String(value)));
      cleanupLegacyLocalStorage();
      return;
    }

    const legacy = readLegacyNativeEntries();

    if (!legacy.size) return;

    legacy.forEach((value, key) => cache.set(key, String(value)));

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB migration failed'));
      const store = tx.objectStore(STORE_NAME);
      legacy.forEach((value, key) => store.put(String(value), key));
    });

    cleanupLegacyLocalStorage();
  }

  function cleanupLegacyLocalStorage() {
    const keysToRemove = [];
    for (let i = 0; i < native.length; i += 1) {
      const key = native.key(i);
      if (isManagedKey(key)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => native.removeItem(key));
  }

  function readJSON(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch (err) {
      console.warn(`Failed to read storage key "${key}"`, err);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn(`Failed to write storage key "${key}"`, err);
      return false;
    }
  }

  function getUsageBytes() {
    let total = 0;
    getReadableEntries().forEach((value, key) => {
      total += key.length + String(value).length;
    });
    return total;
  }

  async function forceFlush() {
    if (!db) return;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    try {
      if (clearPending) {
        await new Promise((resolve, reject) => {
          const tx = db.transaction([STORE_NAME, BLOB_STORE_NAME], 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('IndexedDB clear failed'));
          tx.objectStore(STORE_NAME).clear();
          tx.objectStore(BLOB_STORE_NAME).clear();
        });
        clearPending = false;
        pendingWrites.clear();
        pendingDeletes.clear();
        return;
      }
      if (!pendingWrites.size && !pendingDeletes.size) return;
      const writes = Array.from(pendingWrites.entries());
      const deletes = Array.from(pendingDeletes.values());
      pendingWrites.clear();
      pendingDeletes.clear();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
        const store = tx.objectStore(STORE_NAME);
        writes.forEach(([key, value]) => store.put(value, key));
        deletes.forEach((key) => store.delete(key));
      });
    } catch (err) {
      console.warn('Sanctum storage force flush failed', err);
    }
  }

  window.SanctumStorage = {
    get ready() { return ready; },
    get mode() { return storageMode; },
    get initializationError() { return initializationError; },
    readJSON,
    writeJSON,
    putBlob,
    getBlob,
    removeBlob,
    getUsageBytes,
    flush: forceFlush,
    getManagedKeys() { return Array.from(getReadableEntries().keys()).sort(); },
    exportManagedRaw() {
      const out = {};
      getReadableEntries().forEach((value, key) => { out[key] = value; });
      return out;
    }
  };

  window.SanctumStorageReady = primeCache()
    .then(() => {
      patchLocalStorage();
      storageMode = 'indexeddb';
      ready = true;
      window.dispatchEvent(new CustomEvent('sanctum-storage-ready'));
    })
    .catch((err) => {
      initializationError = String(err?.message || err || 'Unknown storage error');
      const legacyEntries = readLegacyNativeEntries();
      if (legacyEntries.size > 0 && err?.code !== 'SANCTUM_STORAGE_BLOCKED') {
        storageMode = 'localstorage-fallback';
        ready = true;
        console.warn('Sanctum IndexedDB unavailable; using existing localStorage vault data for this session.', err);
        window.dispatchEvent(new CustomEvent('sanctum-storage-ready'));
        return;
      }
      storageMode = 'failed';
      console.error('Sanctum refused to open an empty vault because storage could not be read.', err);
      throw err;
    });
})();
