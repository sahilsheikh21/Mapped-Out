import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('[Vehicle]')) {
      console.log(`PAGE LOG: ${msg.text()}`);
    }
  });
  await page.goto('http://localhost:3000/');
  // Wait a bit to let the scene load
  await page.waitForTimeout(5000);
  // Click start driving
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Start Driving'));
    if (btn) btn.click();
  });
  await page.waitForTimeout(3000);
  
  // Press W to drive
  await page.keyboard.down('w');
  await page.waitForTimeout(2000);
  await page.keyboard.up('w');
  
  await browser.close();
})();
