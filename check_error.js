import puppeteer from 'puppeteer';

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();

        page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
        page.on('pageerror', error => console.error('BROWSER ERROR:', error.message));

        await page.goto('http://localhost:5173/product/4071', { waitUntil: 'networkidle0' });

        await browser.close();
        process.exit(0);
    } catch (e) {
        console.error('Puppeteer Script Error:', e);
        process.exit(1);
    }
})();
