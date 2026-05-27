import http from 'http';

http.request('http://127.0.0.1:3000/api/tickets', {
  headers: { 'x-admin-key': 'YOUR_ADMIN_PASSWORD' }
}, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    let t = JSON.parse(data)[0];
    console.log("Full ticket:", JSON.stringify(t, null, 2));
  });
}).end();
