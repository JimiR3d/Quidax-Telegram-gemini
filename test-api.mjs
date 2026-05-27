import http from 'http';

function testEndpoint(path, method = 'POST') {
  const req = http.request('http://127.0.0.1:3000' + path, {
    method,
    headers: { 'x-admin-key': 'YOUR_ADMIN_PASSWORD', 'Content-Type': 'application/json' }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('Path:', path, 'Status:', res.statusCode, 'Resp:', data.substring(0, 50)));
  });
  req.on('error', err => console.error(err));
  req.write(JSON.stringify({ text: 'testing 1234567', telegramId: 1234 }));
  req.end();
}

testEndpoint('/api/ingest');
testEndpoint('/api/backfill');


