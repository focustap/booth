import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const html = fileURLToPath(new URL('../index.html', import.meta.url));
const port = Number(process.env.PORT || 4173);
createServer(async (req, res) => {
  if (!['/', '/index.html'].includes(req.url?.split('?')[0])) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(await readFile(html));
  } catch {
    res.writeHead(500).end('Could not read index.html');
  }
}).listen(port, '127.0.0.1', () => console.log(`Night Window: http://127.0.0.1:${port}`));
