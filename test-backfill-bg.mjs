import http from 'http';

const req = http.request('http://127.0.0.1:3000/api/backfill', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-admin-key': 'YOUR_ADMIN_PASSWORD'
  }
}, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => console.log('Response:', res.statusCode, data));
});
req.write(JSON.stringify({ limit: 500, days: 30 }));
req.end();
