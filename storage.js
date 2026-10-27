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
  let activeFlush = null;
  let retryDelay = 1000;
  let saveError = '';
  let saveState = 'saved';
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

  function publishSaveState(state, error = '') {
    saveState = state;
    saveError = error;
    window.dispatchEvent(new CustomEvent('sanctum-storage-status', { detail: { state, error } }));
  }

  function hasPendingChanges() {
    return clearPending || pendingWrites.size > 0 || pendingDeletes.size > 0;
  }

  function scheduleFlush(delay = 40) {
    // Keep failures visible until the queued work really commits.
    if (!saveError) publishSaveState('saving');
    if (flushTimer || activeFlush) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void forceFlush();
    }, delay);
  }

  async function drainWrites() {
    while (hasPendingChanges()) {
      const batch = { clear: clearPending, writes: pendingWrites, deletes: pendingDeletes };
      clearPending = false;
      pendingWrites = new Map();
      pendingDeletes = new Set();
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(batch.clear ? [STORE_NAME, BLOB_STORE_NAME] : STORE_NAME, 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onabort = tx.onerror = () => reject(tx.error || new Error('IndexedDB save failed'));
          try {
            const store = tx.objectStore(STORE_NAME);
            if (batch.clear) {
              store.clear();
              tx.objectStore(BLOB_STORE_NAME).clear();
            }
            batch.writes.forEach((value, key) => store.put(value, key));
            batch.deletes.forEach((key) => store.delete(key));
          } catch (error) {
            // A synchronous enqueue error must not commit earlier requests
            // from the same batch (especially a clear followed by writes).
            tx.abort();
            reject(error);
          }
        });
      } catch (err) {
        // A newer clear supersedes the failed batch. Otherwise restore only
        // operations not superseded by a newer edit or deletion.
        if (!clearPending) {
          clearPending = batch.clear;
          batch.writes.forEach((value, key) => {
            if (!pendingWrites.has(key) && !pendingDeletes.has(key)) pendingWrites.set(key, value);
          });
          batch.deletes.forEach((key) => {
            if (!pendingWrites.has(key) && !pendingDeletes.has(key)) pendingDeletes.add(key);
          });
        }
        publishSaveState('error', String(err?.message || err));
        console.warn('Sanctum save failed; changes are retained for retry.', err);
        return false;
      }
    }
    retryDelay = 1000;
    publishSaveState('saved');
    return true;
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

  function forceFlush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (activeFlush) return activeFlush;
    if (!db) return Promise.resolve(storageMode === 'localstorage-fallback');
    if (!hasPendingChanges()) return Promise.resolve(true);
    if (!saveError) publishSaveState('saving');
    // All callers share one drain, including edits arriving during a commit.
    activeFlush = drainWrites().finally(() => {
      activeFlush = null;
      if (hasPendingChanges()) {
        scheduleFlush(retryDelay);
        retryDelay = Math.min(30000, retryDelay * 2);
      }
    });
    return activeFlush;
  }

  window.SanctumStorage = {
    get ready() { return ready; },
    get saveState() { return saveState; },
    get saveError() { return saveError; },
    get hasPendingChanges() { return !!activeFlush || !!hasPendingChanges(); },
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
