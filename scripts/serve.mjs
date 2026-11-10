import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8' };
export function createGameServer() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = decodeURIComponent(url.pathname);
      const allowed = path === '/' || path === '/index.html' || path === '/audio.js' || /^\/assets\/audio\/[a-z0-9-]+\.(wav|js|txt)$/.test(path);
      const target = resolve(root, '.' + (path === '/' ? '/index.html' : path));
      if (!allowed || !target.startsWith(root.endsWith(sep) ? root : root + sep)) {
        res.writeHead(404).end('Not found'); return;
      }
      const data = await readFile(target);
      res.writeHead(200, { 'Content-Type': types[extname(target)], 'Cache-Control': 'no-store' });
      res.end(data);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createGameServer();
  server.listen(port, '127.0.0.1', () => console.log(`Night Window: http://127.0.0.1:${server.address().port}`));
}
