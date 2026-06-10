const puppeteer = require('puppeteer');

(async () => {
  try {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    
    // Capture console messages
    page.on('console', msg => {
      console.log(`[Browser Console] ${msg.type().toUpperCase()}: ${msg.text()}`);
    });
    
    // Capture page errors
    page.on('pageerror', err => {
      console.log(`[Browser PageError]: ${err.toString()}`);
    });

    console.log("Navigating to http://localhost:3000 ...");
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 15000 });
    
    console.log("Page loaded. Waiting a bit for any delayed errors...");
    await new Promise(r => setTimeout(r, 2000));
    
    await browser.close();
    console.log("Done.");
  } catch (err) {
    console.error("Script error:", err);
    process.exit(1);
  }
})();
