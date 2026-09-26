async function testCloudSource(name, url, options = {}) {
  try {
    console.log(`Testing [${name}]: ${url}`);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,application/json,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8',
        ...(options.headers || {})
      }
    });
    console.log(`Status: ${res.status}`);
    if (res.ok) {
      const text = await res.text();
      console.log(`Length: ${text.length}`);
      if (text.toLowerCase().includes('alvarez') || text.toLowerCase().includes('leonora')) {
        console.log(`>>> MATCH FOUND IN [${name}]!\n`);
      } else {
        console.log(`Preview: ${text.substring(0, 200)}\n`);
      }
    }
  } catch (e) {
    console.log(`Error [${name}]: ${e.message}\n`);
  }
}

async function main() {
  const cuit = '27319516277';
  await testCloudSource('CUIT.ONLINE search', `https://cuit.online/search/${cuit}`);
  await testCloudSource('CUIT.ONLINE detail', `https://cuit.online/constancia/cuit/${cuit}`);
  await testCloudSource('DATEAS search', `https://www.dateas.com/es/busca?q=${cuit}`);
  await testCloudSource('AFIP Constancia XML', `https://servicios1.afip.gov.ar/wsfev1/service.asmx`);
  await testCloudSource('CUIT ONLINE Google Cache Proxy', `https://www.google.com/search?q=cuitonline+${cuit}`);
}

main();
