import http from 'http';

const payload = JSON.stringify({ a: 'a'.repeat(60000) });

const req = http.request('http://127.0.0.1:3000/api/ingest', {
  method: 'POST',
  headers: {
    'x-admin-key': 'quidax2026',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Status:', res.statusCode, 'Resp:', data.substring(0, 100)));
});
req.on('error', err => console.error(err));
req.write(payload);
req.end();
