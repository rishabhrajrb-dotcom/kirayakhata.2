// Local JSON store for ANONYMOUS demo metrics and rate-limit counters only.
// Writes are serialised in-process and committed by atomic rename.
// LOCAL PROTOTYPE ONLY: a serverless deployment needs a shared, transactional store
// (local files are neither durable nor shared on Vercel).
import { promises as fs } from 'node:fs';
import path from 'node:path';

export function createLocalStore(dir) {
  let chain = Promise.resolve();
  const file = (name) => path.join(dir, `${name}.json`);

  async function read(name, fallback) {
    try { return JSON.parse(await fs.readFile(file(name), 'utf8')); } catch { return fallback; }
  }
  async function writeAtomic(name, value) {
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${file(name)}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value));
    await fs.rename(tmp, file(name));
  }
  /** Atomic read-modify-write; fn returns { value, result }. */
  function update(name, fallback, fn) {
    const p = chain.then(async () => {
      const cur = await read(name, fallback);
      const { value, result } = await fn(cur);
      await writeAtomic(name, value);
      return result;
    });
    chain = p.catch(() => {});
    return p;
  }
  async function appendLine(name, obj) {
    const p = chain.then(async () => {
      await fs.mkdir(dir, { recursive: true });
      await fs.appendFile(path.join(dir, `${name}.jsonl`), JSON.stringify(obj) + '\n');
    });
    chain = p.catch(() => {});
    return p;
  }
  async function readLines(name) {
    try {
      const txt = await fs.readFile(path.join(dir, `${name}.jsonl`), 'utf8');
      return txt.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
  }
  return { read, update, appendLine, readLines };
}
