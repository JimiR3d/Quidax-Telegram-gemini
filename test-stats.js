const password = "quidax2026";
fetch("http://localhost:3000/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password })
}).then(res => res.json()).then(auth => {
  return fetch("http://localhost:3000/api/tickets?issues_only=true&search=test", {
    headers: { "Authorization": `Bearer ${auth.token}` }
  });
}).then(res => res.json()).then(data => {
  console.log("Total Count:", data.total);
  if (data.stats) {
     console.log("Resolved Count:", data.stats.resolvedCount);
     console.log("Open Count:", data.stats.openCount);
     console.log("Raw Stats Data Length:", data.stats.rawStatsData?.length);
  } else {
     console.log("No stats returned!");
  }
}).catch(console.error);
