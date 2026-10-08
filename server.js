const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_PORT = 3000;
const HOST = '0.0.0.0';
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

function getNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

function startServer(port) {
  const server = http.createServer((req, res) => {
    // Enable CORS and disable caching during dev if requested
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    let decodedUrl;
    try {
      decodedUrl = decodeURIComponent(req.url.split('?')[0]);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    let filePath = path.join(ROOT_DIR, decodedUrl === '/' ? 'index.html' : decodedUrl);

    // Prevent directory traversal
    if (!filePath.startsWith(ROOT_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }

    // Helper to serve file
    const serveFile = (targetFile) => {
      fs.stat(targetFile, (err, stats) => {
        if (err || !stats.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }

        const ext = path.extname(targetFile).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        const headers = {
          'Content-Type': contentType,
          'Content-Length': stats.size,
          'Accept-Ranges': 'bytes'
        };

        if (ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp') {
          headers['Cache-Control'] = 'public, max-age=31536000, immutable';
        }

        res.writeHead(200, headers);
        fs.createReadStream(targetFile).pipe(res);
      });
    };

    // Check if target exists directly, or try target + .html for clean routes
    fs.stat(filePath, (err, stats) => {
      if (!err && stats.isFile()) {
        serveFile(filePath);
      } else if (!err && stats.isDirectory()) {
        const indexFile = path.join(filePath, 'index.html');
        fs.stat(indexFile, (iErr, iStats) => {
          if (!iErr && iStats.isFile()) {
            serveFile(indexFile);
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
          }
        });
      } else {
        const htmlPath = filePath + '.html';
        fs.stat(htmlPath, (hErr, hStats) => {
          if (!hErr && hStats.isFile()) {
            serveFile(htmlPath);
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
          }
        });
      }
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  server.listen(port, HOST, () => {
    const netIp = getNetworkIp();
    console.log(`SERVER_RUNNING_AT: http://localhost:${port}`);
    console.log(`LOCAL_URL: http://localhost:${port}`);
    console.log(`NETWORK_URL: http://${netIp}:${port}`);
  });
}

startServer(process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT);
