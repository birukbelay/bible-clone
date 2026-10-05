/**
 * Prepares the bundled Bible databases for the web build:
 *
 *   assets/db/<id>.db  ->  public/bibles/<id>.<hash>.db.gz  +  public/bibles/index.json
 *
 * The full-text index (verses_fts) is dropped first: the browser's SQLite (wa-sqlite) has no FTS5,
 * so it would only be dead weight (web search scans the verses instead, see src/bible/queries.ts).
 * Files are gzipped here because static hosts serve unknown binary types uncompressed; the app
 * inflates them with DecompressionStream. The content hash in the name lets browsers cache them
 * forever. index.json lists the files with their info table (read by src/bible/versions.web.ts).
 *
 * Run with node >= 22.13 (node:sqlite): node scripts/build-web-dbs.mjs
 */
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets', 'db');
const out = join(root, 'public', 'bibles');
const work = mkdtempSync(join(tmpdir(), 'fyn-web-dbs-'));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const manifest = { format: 1, strongs: null, versions: [] };
try {
  for (const name of readdirSync(src).filter((f) => f.endsWith('.db')).sort()) {
    const id = name.replace(/\.db$/, '');
    const tmp = join(work, name);
    copyFileSync(join(src, name), tmp);
    const db = new DatabaseSync(tmp);
    db.exec('DROP TABLE IF EXISTS verses_fts; PRAGMA journal_mode = DELETE; VACUUM;');
    const info = Object.fromEntries(db.prepare('SELECT key, value FROM info').all().map((r) => [r.key, r.value ?? '']));
    db.close();

    const raw = readFileSync(tmp);
    const gz = gzipSync(raw, { level: 9 });
    const hash = createHash('sha256').update(raw).digest('hex').slice(0, 10);
    const file = `${id}.${hash}.db.gz`;
    writeFileSync(join(out, file), gz);

    const entry = { file, size: raw.length, gzipSize: gz.length, info };
    if (id === 'strongs') manifest.strongs = entry;
    else if (info.id === id) manifest.versions.push(entry);
    else throw new Error(`${name}: info.id is ${info.id}`);
    console.log(`${name.padEnd(12)} ${(raw.length / 1e6).toFixed(1).padStart(5)} MB -> ${(gz.length / 1e6).toFixed(1)} MB gz`);
  }
  if (!manifest.strongs) throw new Error('assets/db/strongs.db is missing');
  writeFileSync(join(out, 'index.json'), JSON.stringify(manifest, null, 2) + '\n');
} finally {
  rmSync(work, { recursive: true, force: true });
}
