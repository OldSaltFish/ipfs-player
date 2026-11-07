// 本地预览服务器：以工作区根目录为站点根，支持音频 Range 请求
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const port = Number(process.env.PORT || 8787);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.lrc': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.jpg': 'image/jpeg',
};

createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') pathname = '/ipfs-player/index.html';
    else if (pathname.endsWith('/')) pathname += 'index.html';
    const full = normalize(join(root, pathname));
    if (!full.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
    const st = await stat(full);
    if (!st.isFile()) { res.writeHead(404).end('not found'); return; }

    const type = MIME[extname(full).toLowerCase()] || 'application/octet-stream';
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
      });
      createReadStream(full, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      'Content-Type': type, 'Content-Length': st.size,
      'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
    });
    createReadStream(full).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
  }
}).listen(port, () => console.log(`http://localhost:${port}/ipfs-player/`));
