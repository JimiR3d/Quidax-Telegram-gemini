import fetch from 'node-fetch';
async function run() {
  const login = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'quidax2026' })
  });
  const data = await login.json();
  const token = data.token;
  
  const res = await fetch('http://localhost:3000/api/tickets?page=0&pageSize=20&issues_only=true', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  console.log(res.status, await res.text());
}
run();
