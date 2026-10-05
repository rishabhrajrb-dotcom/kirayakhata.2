// Storage / auth adapter contracts. LOCAL implementation lives in public/js/store-idb.js
// (IndexedDB, device-only). The SUPABASE implementation is a planned stub: it must derive the
// owner from the verified session (never a client-supplied owner_id) and rely on row-level
// security for every private table. See docs/production-roadmap.md.

/** @typedef {{ get, put, delete, list, findOne, tx }} Repo */

export const storageProviders = {
  local: { name: 'indexeddb-local', persistent: 'device-only', multiUser: false },
  supabase: {
    name: 'supabase', status: 'PLANNED',
    create() { throw new Error('Supabase storage is not configured in the local build. See docs/production-roadmap.md.'); },
  },
};

export const authProvider = {
  status: 'PLANNED',
  async getSession() { return null; }, // local mode: no accounts, no fake login
  async signIn() { throw new Error('Authentication is not enabled in the local build.'); },
  async signOut() { throw new Error('Authentication is not enabled in the local build.'); },
};
