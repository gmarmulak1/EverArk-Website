/**
 * Minimal static server for local development and for the visual-diff harness.
 * Mirrors what a static host does: extensionless URLs resolve to <name>.html,
 * "/" resolves to index.html, and anything unknown returns 404.html.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  const candidates = rel === '' ? ['index.html'] : [rel, `${rel}.html`, path.join(rel, 'index.html')];
  for (const c of candidates) {
    const abs = path.join(ROOT, c);
    if (abs.startsWith(ROOT) && fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  }
  return null;
}

http
  .createServer((req, res) => {
    const abs = resolveFile(req.url);
    if (!abs) {
      const fallback = path.join(ROOT, '404.html');
      const body = fs.existsSync(fallback) ? fs.readFileSync(fallback) : 'Not Found';
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(body);
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    fs.createReadStream(abs).pipe(res);
  })
  .listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
