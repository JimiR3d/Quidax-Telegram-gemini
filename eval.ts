await fetch('http://localhost:3000/api/auth/verify').then(res => res.text()).then(console.log).catch(console.error);
