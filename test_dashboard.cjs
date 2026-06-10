const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log(`[Console] ${msg.type().toUpperCase()}: ${msg.text()}`));
    page.on('pageerror', err => console.log(`[PageError] ${err.toString()}`));

    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    
    // Inject fake token
    await page.evaluate(() => {
      sessionStorage.setItem('pd_token', 'test_token');
    });

    // Reload with token
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
    
    await new Promise(r => setTimeout(r, 2000));
    await browser.close();
  } catch (err) {
    console.error(err);
  }
})();
