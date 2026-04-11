import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: false });
const page = await browser.newPage();

// Log ALL network responses that contain "862" or pricing data
page.on('response', async (response) => {
  try {
    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('json') && !ct.includes('graphql')) return;
    const text = await response.text();
    if (text.includes('862') || text.includes('altValue')) {
      console.log('\n=== FOUND $862 ===');
      console.log('URL:', response.url().substring(0, 150));
      console.log('Data:', text.substring(0, 2000));
    }
  } catch {}
});

console.log('Going to asset page...');
// Go directly to the asset research page
await page.goto('https://alt.xyz/research/item/770dd69b-ef06-4a84-9cd7-a2c94032b8ef', {
  waitUntil: 'networkidle2',
  timeout: 60000
});

console.log('Loaded. Waiting 15s for dynamic content...');
await new Promise(r => setTimeout(r, 15000));

await browser.close();
