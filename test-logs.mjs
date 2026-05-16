import { chromium } from 'playwright';

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('[Vehicle]')) {
      console.log(`PAGE LOG: ${msg.text()}`);
    }
  });
  console.log('Navigating...');
  await page.goto('http://localhost:3000/');
  await page.waitForTimeout(5000);
  
  console.log('Starting driving...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Start Driving'));
    if (btn) btn.click();
  });
  await page.waitForTimeout(3000);
  
  console.log('Pressing W...');
  await page.keyboard.down('w');
  await page.waitForTimeout(2000);
  await page.keyboard.up('w');
  
  await browser.close();
  console.log('Done!');
})();
