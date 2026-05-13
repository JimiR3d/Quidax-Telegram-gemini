const rateLimit = require('express-rate-limit');
try {
  rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 200, 
    validate: { 
      trustProxy: false,
      xForwardedForHeader: false
    } 
  });
  console.log("Success");
} catch(e) {
  console.error("Error", e);
}
