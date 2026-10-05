// Cloud repository (Supabase) implementing the shared repo contract for a SIGNED-IN owner.
// Rows live in public.kk_records; row-level security limits every read/write to auth.uid().
// Writes go through the kk_apply() function so each transaction is applied atomically, and
// unique indexes on the server stop duplicate monthly invoices / invoice numbers.
import { STORES } from '/shared/billing-service.js';
import { UNIQUE } from '/shared/memory-repo.js';

const clone = (o) => (o === undefined ? undefined : structuredClone(o));

export async function createCloudRepo({ supabaseUrl, anonKey, getToken }) {
  let data = {};
  let queue = Promise.resolve();
  let inTx = null;

  async function headers() {
    const token = await getToken();
    if (!token) { const e = new Error('Your session has ended. Please sign in again.'); e.code = 'SIGNED_OUT'; throw e; }
    return { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  async function load() {
    const next = Object.fromEntries(STORES.map((s) => [s, {}]));
    const h = await headers();
    for (let from = 0; ; from += 1000) {
      const res = await fetch(`${supabaseUrl}/rest/v1/kk_records?select=store,id,data&order=store,id`, { headers: { ...h, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } });
      if (res.status === 401) { const e = new Error('Your session has ended. Please sign in again.'); e.code = 'SIGNED_OUT'; throw e; }
      if (!res.ok && res.status !== 206) throw new Error(`Could not load your records (${res.status}).`);
      const rows = await res.json();
      for (const r of rows) if (next[r.store]) next[r.store][r.id] = r.data;
      if (rows.length < 1000) break;
    }
    data = next;
  }

  async function commit(changes) {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/kk_apply`, { method: 'POST', headers: await headers(), body: JSON.stringify({ changes }) });
    if (res.ok) return;
    const body = await res.json().catch(() => ({}));
    if (body.code === '23505') { const e = new Error('This would create a duplicate (invoice number or monthly document).'); e.name = 'ConstraintError'; throw e; }
    if (res.status === 401) { const e = new Error('Your session has ended. Please sign in again.'); e.code = 'SIGNED_OUT'; throw e; }
    throw new Error(`Could not save (${body.message || res.status}). Nothing was changed.`);
  }

  function uniqueCheck(store, obj) {
    for (const field of UNIQUE[store] || []) {
      if (obj[field] == null) continue;
      if (Object.values(data[store] || {}).some((x) => x.id !== obj.id && x[field] === obj[field])) { const e = new Error(`Duplicate ${store}.${field}`); e.name = 'ConstraintError'; throw e; }
    }
  }

  const reads = {
    async get(store, id) { return clone(data[store]?.[id]); },
    async list(store) { return Object.values(data[store] || {}).map(clone); },
    async findOne(store, field, value) { return clone(Object.values(data[store] || {}).find((x) => x[field] === value)); },
  };

  const repo = {
    ...reads,
    kind: 'cloud',
    async put(store, obj) { if (inTx) return inTx.put(store, obj); return repo.tx([store], (r) => r.put(store, obj)); },
    async delete(store, id) { if (inTx) return inTx.delete(store, id); return repo.tx([store], (r) => r.delete(store, id)); },
    async tx(_stores, fn) {
      if (inTx) return fn(inTx);
      const run = async () => {
        await load(); // pick up changes from the user's other devices first
        const backup = data; data = structuredClone(data);
        const dirty = new Map();
        inTx = {
          ...reads,
          async put(store, obj) {
            if (!obj || !obj.id) throw new Error(`put(${store}) needs an id`);
            uniqueCheck(store, obj);
            (data[store] = data[store] || {})[obj.id] = clone(obj);
            dirty.set(`${store}\u0000${obj.id}`, { store, id: obj.id });
            return obj.id;
          },
          async delete(store, id) { delete data[store]?.[id]; dirty.set(`${store}\u0000${id}`, { store, id }); },
          tx: (_s, f) => f(inTx),
        };
        try {
          const result = await fn(inTx);
          const changes = [...dirty.values()].map(({ store, id }) => ({ store, id, data: data[store]?.[id] ?? null }));
          for (let i = 0; i < changes.length; i += 400) await commit(changes.slice(i, i + 400));
          return result;
        } catch (e) { data = backup; throw e; } finally { inTx = null; }
      };
      const locked = () => (navigator.locks ? navigator.locks.request('kk-cloud-repo', run) : run());
      const p = queue.then(locked, locked); queue = p.catch(() => {});
      return p;
    },
    async reload() { await load(); },
    async exportAll() {
      await load();
      return { format: 'kirayakhata-export', schemaVersion: 1, exportedAt: new Date().toISOString(), database: 'cloud', data: Object.fromEntries(STORES.map((s) => [s, Object.values(data[s] || {})])) };
    },
    /** Imports a backup or this device's local records. Existing ids are overwritten; nothing is deleted. */
    async importAll(file) {
      if (!file || file.format !== 'kirayakhata-export' || typeof file.data !== 'object') throw new Error('This is not a KirayaKhata export file.');
      const changes = [];
      for (const s of STORES) for (const rec of file.data[s] || []) if (rec && typeof rec.id === 'string') changes.push({ store: s, id: rec.id, data: rec });
      for (let i = 0; i < changes.length; i += 400) await commit(changes.slice(i, i + 400));
      await load();
      return changes.length;
    },
    async deleteEverything() {
      await load();
      const changes = STORES.flatMap((s) => Object.keys(data[s] || {}).map((id) => ({ store: s, id, data: null })));
      for (let i = 0; i < changes.length; i += 400) await commit(changes.slice(i, i + 400));
      await load();
    },
    async counts() { await load(); return Object.fromEntries(STORES.map((s) => [s, Object.keys(data[s] || {}).length])); },
    close() {},
  };
  await load();
  return repo;
}
