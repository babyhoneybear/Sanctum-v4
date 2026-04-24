(function () {
  const DB_NAME = 'sanctum_vault';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';
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

  function isManagedKey(key) {
    return typeof key === 'string' && (key.startsWith(MANAGED_PREFIX) || MANAGED_EXACT.has(key));
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      if (!db) return;
      try {
        if (clearPending) {
          await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('IndexedDB clear failed'));
            tx.objectStore(STORE_NAME).clear();
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
      req.onupgradeneeded = () => {
        const nextDb = req.result;
        if (!nextDb.objectStoreNames.contains(STORE_NAME)) {
          nextDb.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB unavailable'));
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

  async function primeCache() {
    db = await openDb();
    const dbEntries = await loadAllFromDb();

    if (dbEntries.size > 0) {
      dbEntries.forEach((value, key) => cache.set(key, String(value)));
      cleanupLegacyLocalStorage();
      return;
    }

    const legacy = new Map();
    for (let i = 0; i < native.length; i += 1) {
      const key = native.key(i);
      if (!isManagedKey(key)) continue;
      const value = native.getItem(key);
      if (value != null) legacy.set(key, value);
    }

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
    cache.forEach((value, key) => {
      total += key.length + String(value).length;
    });
    return total;
  }

  window.SanctumStorage = {
    get ready() { return ready; },
    readJSON,
    writeJSON,
    getUsageBytes,
    getManagedKeys() { return Array.from(cache.keys()).sort(); },
    exportManagedRaw() {
      const out = {};
      cache.forEach((value, key) => { out[key] = value; });
      return out;
    }
  };

  patchLocalStorage();

  window.SanctumStorageReady = primeCache()
    .then(() => {
      ready = true;
      window.dispatchEvent(new CustomEvent('sanctum-storage-ready'));
    })
    .catch((err) => {
      console.warn('Sanctum storage init failed; falling back to native localStorage', err);
      ready = true;
      window.dispatchEvent(new CustomEvent('sanctum-storage-ready'));
    });
})();
