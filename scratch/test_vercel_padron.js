async function testVercelApis(cuit) {
  const apis = [
    `https://cuit-v2.now.sh/cuit/${cuit}`,
    `https://padron-afip.vercel.app/api/cuit/${cuit}`,
    `https://afip-padron-api.vercel.app/api/cuit/${cuit}`,
    `https://cuit-api.vercel.app/cuit/${cuit}`,
    `https://api.cuitalizer.com.ar/cuit/${cuit}`,
    `https://padron-afip-api.now.sh/api/cuit/${cuit}`
  ];

  for (const url of apis) {
    try {
      console.log(`Testing: ${url}`);
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      console.log(`Status: ${res.status}`);
      if (res.ok) {
        const text = await res.text();
        console.log(`Response: ${text.substring(0, 300)}\n`);
      }
    } catch (e) {
      console.log(`Failed: ${e.message}\n`);
    }
  }
}

testVercelApis('27319516277');
