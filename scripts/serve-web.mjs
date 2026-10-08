/**
 * Serves the web export (dist/) like vercel.json does: isolation headers, long caching for
 * hashed files and index.html for app routes. Usage: node scripts/serve-web.mjs [dir] [port]
 */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = process.argv[2] ?? 'dist';
const port = Number(process.argv[3] ?? process.env.PORT ?? 8081);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.gz': 'application/octet-stream',
};

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  if (!isFile(file)) file = isFile(`${file}.html`) ? `${file}.html` : join(root, 'index.html');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
  // if (/^\/(_expo\/static|assets|bibles)\//.test(path) && !path.endsWith('index.json')) {
  if (path === '/coi-serviceworker.js') {
    // Service workers must not be cached so the browser can update them.
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  } else if (/^\\/(_expo\\/static|assets|bibles)\\/ /.test(path) && !path.endsWith('index.json')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port} (${root})`));
