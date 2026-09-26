import https from 'https';
import http from 'http';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function testAPIs(cuit) {
  const cleanCuit = cuit.replace(/\D/g, '');
  const apis = [
    `https://afip.padron.ar/api/v1/persona/${cleanCuit}`,
    `https://cuit.online/search/${cleanCuit}`,
    `https://api.apis.net.ar/v1/cuit?cuit=${cleanCuit}`,
    `https://sr-padron.afip.gov.ar/sr-padron/v2/persona/${cleanCuit}`,
    `https://cuit.net.ar/api/cuit/${cleanCuit}`
  ];

  for (const api of apis) {
    try {
      console.log(`Testing: ${api}`);
      const res = await fetchUrl(api);
      console.log(`Status: ${res.status}`);
      console.log(`Sample output (200 chars): ${res.data.substring(0, 200)}\n`);
    } catch (err) {
      console.log(`Failed: ${err.message}\n`);
    }
  }
}

testAPIs('30500010912');
