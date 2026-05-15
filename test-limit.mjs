import http from 'http';

function hitLimit() {
  let count = 0;
  for (let i = 0; i < 205; i++) {
    http.get('http://127.0.0.1:3000/api/health', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        count++;
        if (res.statusCode === 429) {
          console.log('429 Resp:', data);
        }
      });
    }).on('error', () => {});
  }
}
hitLimit();
