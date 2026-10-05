// Clears the server-side ANONYMOUS demo metrics and rate-limit counters (work/local-data).
// Your private records live in the browser (IndexedDB): reset them from /app -> Settings & data.
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'work', 'local-data');
await rm(dir, { recursive: true, force: true });
console.log('Cleared anonymous demo metrics and rate-limit data in', dir);
