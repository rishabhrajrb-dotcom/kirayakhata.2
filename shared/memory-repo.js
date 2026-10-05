// In-memory implementation of the repo contract (tests, server-side previews).
// Transactions are serialised through a promise queue and roll back on error.
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

export function createMemoryRepo(seed = {}) {
  let data = {};
  for (const [store, rows] of Object.entries(seed)) data[store] = Object.fromEntries(rows.map((r) => [r.id, clone(r)]));
  let queue = Promise.resolve();
  let inTx = false;

  const api = (getData) => ({
    async get(store, id) { return clone(getData()[store]?.[id]); },
    async put(store, obj) {
      if (!obj || !obj.id) throw new Error(`put(${store}) needs an id`);
      const d = getData();
      d[store] = d[store] || {};
      // Unique indexes enforced like IndexedDB would.
      for (const field of UNIQUE[store] || []) {
        if (obj[field] == null) continue;
        const clash = Object.values(d[store]).find((x) => x.id !== obj.id && x[field] === obj[field]);
        if (clash) { const e = new Error(`Unique constraint ${store}.${field}`); e.name = 'ConstraintError'; throw e; }
      }
      d[store][obj.id] = clone(obj);
      return obj.id;
    },
    async delete(store, id) { delete getData()[store]?.[id]; },
    async list(store) { return Object.values(getData()[store] || {}).map(clone); },
    async findOne(store, field, value) { return clone(Object.values(getData()[store] || {}).find((x) => x[field] === value)); },
  });

  const repo = {
    ...api(() => data),
    async tx(_stores, fn) {
      if (inTx) return fn(repo); // nested: join the outer transaction
      const run = async () => {
        inTx = true;
        const backup = clone(data);
        try { return await fn(repo); } catch (e) { data = backup; throw e; } finally { inTx = false; }
      };
      const p = queue.then(run, run);
      queue = p.catch(() => {});
      return p;
    },
    dump() { return clone(data); },
  };
  return repo;
}

export const UNIQUE = {
  invoices: ['activeKey', 'numberKey'],
  outbox: ['idempotencyKey'],
};
