// The blind A/B page:  node serve.mjs   then open http://localhost:4567
// The videos are chosen in the page and stay on the computer.
import http from 'node:http';
import fs from 'node:fs';
const F = { '/': ['ab.html', 'text/html; charset=utf-8'], '/ab.mjs': ['ab.mjs', 'text/javascript; charset=utf-8'] };
http.createServer((q, s) => {
  const f = F[q.url.split('?')[0]]; if (!f) { s.writeHead(404).end(); return; }
  s.writeHead(200, { 'Content-Type': f[1], 'Cache-Control': 'no-store' }).end(fs.readFileSync(new URL(f[0], import.meta.url)));
}).listen(4567, '127.0.0.1', () => console.log('http://localhost:4567'));
