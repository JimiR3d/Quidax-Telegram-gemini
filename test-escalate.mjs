import http from 'http';

http.request('http://127.0.0.1:3000/api/tickets', {
  headers: { 'x-admin-key': 'YOUR_ADMIN_PASSWORD' }
}, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    let t = JSON.parse(data)[0];
    if (!t) return console.log("No tickets");
    console.log("Escalating ticket", t.id);
    const req = http.request('http://127.0.0.1:3000/api/tickets/' + t.id + '/escalate', {
      method: "POST", headers: { 'x-admin-key': 'YOUR_ADMIN_PASSWORD' }
    }, res2 => {
      let d2 = ''; res2.on('data', c => d2+=c);
      res2.on('end', () => console.log('Resp:', d2));
    });
    req.end();
  });
}).end();
