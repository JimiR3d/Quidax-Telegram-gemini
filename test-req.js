async function test() {
  try {
     console.log("Fetching...");
     let res = await fetch('http://localhost:3000/api/auth/verify', { headers: {'x-admin-key': 'YOUR_ADMIN_PASSWORD'}});
     let body = await res.text();
     console.log(res.status, body);
  } catch(e) {
     console.error("Caught:", e);
  }
}
test();
