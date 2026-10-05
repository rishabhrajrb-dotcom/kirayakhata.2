// IndexedDB repository (device-only storage) implementing the shared repo contract.
// Strategy: each transaction takes a cross-tab lock (navigator.locks when available), reloads
// the stores from IndexedDB, runs the same logic as the tested memory repo, then commits every
// changed record in ONE readwrite IndexedDB transaction. Unique indexes back up the in-memory
// uniqueness checks. This is local device storage, not an authenticated or encrypted account.
import { STORES } from '/shared/billing-service.js';
import { UNIQUE } from '/shared/memory-repo.js';

export const SCHEMA_VERSION = 1;
const clone = (o) => (o === undefined ? undefined : structuredClone(o));

function openDB(name) {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB is not available in this browser.')); return; }
    const req = indexedDB.open(name, SCHEMA_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of [...STORES, 'meta']) {
        if (!db.objectStoreNames.contains(s)) {
          const os = db.createObjectStore(s, { keyPath: 'id' });
          for (const f of UNIQUE[s] || []) os.createIndex(f, f, { unique: true });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Close other KirayaKhata tabs and try again.'));
  });
}

const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function createIdbRepo(name) {
  const db = await openDB(name);
  let data = {};
  let queue = Promise.resolve();
  let inTx = null;

  async function load() {
    const t = db.transaction([...STORES, 'meta'], 'readonly');
    const next = {};
    await Promise.all([...STORES, 'meta'].map(async (s) => { next[s] = Object.fromEntries((await reqP(t.objectStore(s).getAll())).map((r) => [r.id, r])); }));
    data = next;
  }

  function uniqueCheck(store, obj) {
    for (const field of UNIQUE[store] || []) {
      if (obj[field] == null) continue;
      const clash = Object.values(data[store] || {}).find((x) => x.id !== obj.id && x[field] === obj[field]);
      if (clash) { const e = new Error(`Duplicate ${store}.${field}`); e.name = 'ConstraintError'; throw e; }
    }
  }

  const reads = {
    async get(store, id) { return clone(data[store]?.[id]); },
    async list(store) { return Object.values(data[store] || {}).map(clone); },
    async findOne(store, field, value) { return clone(Object.values(data[store] || {}).find((x) => x[field] === value)); },
  };

  const repo = {
    ...reads,
    async put(store, obj) { if (inTx) return inTx.put(store, obj); return repo.tx([store], (r) => r.put(store, obj)); },
    async delete(store, id) { if (inTx) return inTx.delete(store, id); return repo.tx([store], (r) => r.delete(store, id)); },
    async tx(_stores, fn) {
      if (inTx) return fn(inTx);
      const run = async () => {
        await load();
        const backup = data;
        data = structuredClone(data);
        const dirty = new Map();
        inTx = {
          ...reads,
          async put(store, obj) {
            if (!obj || !obj.id) throw new Error(`put(${store}) needs an id`);
            uniqueCheck(store, obj);
            data[store] = data[store] || {};
            data[store][obj.id] = clone(obj);
            dirty.set(`${store}\u0000${obj.id}`, { store, id: obj.id });
            return obj.id;
          },
          async delete(store, id) { delete data[store]?.[id]; dirty.set(`${store}\u0000${id}`, { store, id }); },
          tx: (_s, f) => f(inTx),
        };
        try {
          const result = await fn(inTx);
          if (dirty.size) {
            const stores = [...new Set([...dirty.values()].map((d) => d.store))];
            const t = db.transaction(stores, 'readwrite');
            for (const { store, id } of dirty.values()) {
              const rec = data[store]?.[id];
              if (rec) t.objectStore(store).put(rec); else t.objectStore(store).delete(id);
            }
            await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Storage transaction aborted')); });
          }
          return result;
        } catch (e) { data = backup; throw e; } finally { inTx = null; }
      };
      const locked = () => (navigator.locks ? navigator.locks.request(`kk-repo-${name}`, run) : run());
      const p = queue.then(locked, locked);
      queue = p.catch(() => {});
      return p;
    },
    async reload() { await load(); },
    async exportAll() {
      await load();
      const out = {};
      for (const s of STORES) out[s] = Object.values(data[s] || {});
      return { format: 'kirayakhata-export', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), database: name, data: out };
    },
    async importAll(file) {
      if (!file || file.format !== 'kirayakhata-export' || typeof file.data !== 'object') throw new Error('This is not a KirayaKhata export file.');
      if (file.schemaVersion > SCHEMA_VERSION) throw new Error('This export comes from a newer version.');
      const t = db.transaction(STORES, 'readwrite');
      for (const s of STORES) {
        t.objectStore(s).clear();
        for (const rec of file.data[s] || []) { if (rec && typeof rec.id === 'string') t.objectStore(s).put(rec); }
      }
      await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Import aborted (duplicate numbers?)')); });
      await load();
    },
    async counts() { await load(); return Object.fromEntries(STORES.map((s) => [s, Object.keys(data[s] || {}).length])); },
    close() { db.close(); },
  };
  await load();
  return repo;
}

export function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = () => resolve(); r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Close other KirayaKhata tabs, then try again.'));
  });
}
