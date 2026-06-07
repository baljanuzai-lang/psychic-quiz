const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

const PORT = 3000;

const MIME = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.png':  'image/png',
  '.js':   'application/javascript',
};

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const server = http.createServer((req, res) => {

  // Log every request so we can see what's coming in
  console.log(`${req.method} ${req.url}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── PROXY TO ANTHROPIC API ──────────────────────────────────────────────────
  if (req.url === '/api' || req.url.startsWith('/api?') || req.url === '/api/') {
    console.log('API route hit - method:', req.method);

    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed  = JSON.parse(body);
        const apiKey  = parsed.apiKey;
        delete parsed.apiKey;
        const postData = JSON.stringify(parsed);

        console.log('Forwarding to Anthropic, model:', parsed.model);

        const options = {
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        const apiReq = https.request(options, apiRes => {
          let data = '';
          apiRes.on('data', c => { data += c; });
          apiRes.on('end', () => {
            console.log('Anthropic response status:', apiRes.statusCode);
            res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
            res.end(data);
          });
        });

        apiReq.on('error', e => {
          console.log('Anthropic error:', e.message);
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        });

        apiReq.write(postData);
        apiReq.end();

      } catch(e) {
        console.log('Parse error:', e.message);
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Bad request: ' + e.message }));
      }
    });
    return;
  }

  // ── SERVE STATIC FILES ──────────────────────────────────────────────────────
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath.split('?')[0]);
  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.log('File not found:', filePath);
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('\n========================================');
  console.log('  Psychic Flashcard App — RUNNING!');
  console.log('========================================');
  console.log(`\n  Open on your phone:`);
  console.log(`  http://${ip}:${PORT}`);
  console.log('\n  Keep this window open!');
  console.log('  Press Ctrl+C to stop');
  console.log('========================================\n');
});
