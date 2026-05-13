async function test() {
  try {
     console.log("Fetching...");
     let res = await fetch('http://localhost:3000/api/auth/verify', { headers: {'x-admin-key': 'quidax2026'}});
     let body = await res.text();
     console.log(res.status, body);
  } catch(e) {
     console.error("Caught:", e);
  }
}
test();
