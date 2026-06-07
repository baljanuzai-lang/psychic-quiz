const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.png':  'image/png',
  '.js':   'application/javascript',
};

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── PROXY TO ANTHROPIC ──────────────────────────────────────────────────────
  if (req.url === '/api' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed  = JSON.parse(body);
        // Use env var API key — remove from body if sent
        const apiKey  = process.env.ANTHROPIC_API_KEY || parsed.apiKey;
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
            console.log('Anthropic status:', apiRes.statusCode);
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
        res.end(JSON.stringify({ error: 'Bad request' }));
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
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nPsychic Flashcard App running on port ${PORT}\n`);
});
