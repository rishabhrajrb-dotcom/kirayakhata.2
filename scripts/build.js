// Build step (local and Vercel): copies browser files into public/ so they are served
// statically. public/shared, public/docs and public/vendor are generated — do not edit them.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');

async function copyDir(from, to, filter = () => true) {
  await fs.mkdir(to, { recursive: true });
  for (const f of await fs.readdir(from)) {
    if (filter(f)) await fs.copyFile(path.join(from, f), path.join(to, f));
  }
}

await fs.mkdir(path.join(PUB, 'vendor'), { recursive: true });
await fs.copyFile(path.join(ROOT, 'node_modules', 'jspdf', 'dist', 'jspdf.umd.min.js'), path.join(PUB, 'vendor', 'jspdf.umd.min.js'));
// The deterministic engine runs in the browser too (previews). schemas.js is server-only (zod).
await copyDir(path.join(ROOT, 'shared'), path.join(PUB, 'shared'), (f) => f.endsWith('.js') && f !== 'schemas.js');
await copyDir(path.join(ROOT, 'docs'), path.join(PUB, 'docs'), (f) => f.endsWith('.md'));
console.log('build: vendor/jspdf, shared/ engine and docs/ copied into public/');

const required = ['hero-workflow', 'invoices-two-documents', 'deadline-reminders', 'payment-matching', 'year-end-pack'].flatMap((s) => [640, 960, 1536].map((w) => `${s}-${w}.webp`));
const missing = [];
for (const f of required) { try { await fs.access(path.join(PUB, 'assets', f)); } catch { missing.push(f); } }
if (missing.length) { console.error('Missing assets (run: python scripts/optimize-images.py):', missing.join(', ')); process.exitCode = 1; } else console.log(`assets ok (${required.length} files)`);
