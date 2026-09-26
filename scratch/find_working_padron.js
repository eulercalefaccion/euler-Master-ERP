async function testApi(name, url, options = {}) {
  try {
    console.log(`Testing [${name}]: ${url}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...(options.headers || {})
      }
    });
    clearTimeout(timer);
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Response length: ${text.length}`);
    console.log(`Preview: ${text.substring(0, 300)}\n`);
  } catch (err) {
    console.log(`Failed [${name}]: ${err.message}\n`);
  }
}

async function main() {
  const cuit = '27319516277';
  
  await testApi('APIs Net AR', `https://api.apis.net.ar/v1/cuit?cuit=${cuit}`);
  await testApi('AFIP Padron AR', `https://afip.padron.ar/api/v1/persona/${cuit}`);
  await testApi('AFIP Constancia Portal', `https://servicios1.afip.gov.ar/wsfev1/service.asmx`);
  await testApi('CUIT Online API Json', `https://www.cuitonline.com/api/v1/cuit/${cuit}`);
  await testApi('Sircot CUIT', `https://api.sircot.com/v1/cuit/${cuit}`);
  await testApi('AFIP Padrón A4 Public', `https://sr-padron.afip.gov.ar/sr-padron/v2/persona/${cuit}`);
  await testApi('Cuitalizer API', `https://cuitalizer.com/api/cuit/${cuit}`);
  await testApi('TusFacturas API', `https://api.tusfacturas.app/api/v1/cuit/${cuit}`);
  await testApi('AFIP SDK Public Sandbox', `https://afip.sdk.com.ar/api/v1/cuit/${cuit}`);
}

main();
