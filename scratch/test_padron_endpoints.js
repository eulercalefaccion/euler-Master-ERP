async function testEndpoint(name, url) {
  try {
    console.log(`--- Testing ${name} ---`);
    console.log(`URL: ${url}`);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/html, */*'
      }
    });
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Length: ${text.length}`);
    console.log(`Sample: ${text.substring(0, 300)}\n`);
  } catch (err) {
    console.log(`Failed: ${err.message}\n`);
  }
}

async function run() {
  const cuit = '27319516277';
  await testEndpoint('APIs Net AR', `https://api.apis.net.ar/v1/cuit?cuit=${cuit}`);
  await testEndpoint('AFIP Padron AR', `https://afip.padron.ar/api/v1/persona/${cuit}`);
  await testEndpoint('CUIT Online HTML', `https://www.cuitonline.com/search.php?q=${cuit}`);
  await testEndpoint('CUIT Online Direct', `https://www.cuitonline.com/detalle/27319516277`);
  await testEndpoint('CORS Proxy cuitonline', `https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.cuitonline.com/search.php?q=${cuit}`)}`);
}

run();
