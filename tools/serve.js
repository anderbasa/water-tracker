/* serve.js — servidor estático mínimo para desarrollo local.
   Uso:  node tools/serve.js [puerto]   (por defecto 4173) */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2]) || 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }

  fs.stat(filePath, (err, stat) => {
    if (err || stat.isDirectory()) {
      filePath = path.join(ROOT, 'index.html'); // SPA fallback
    }
    fs.readFile(filePath, (e, data) => {
      if (e) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
