async function testOptions(cuit) {
  const cleanCuit = cuit.replace(/\D/g, '');

  const targets = [
    { name: 'cuitonline search', url: `https://www.cuitonline.com/search.php?q=${cleanCuit}` },
    { name: 'cuitonline constancia', url: `https://www.cuitonline.com/constancia/cuit/${cleanCuit}` },
    { name: 'cuit.net.ar', url: `https://cuit.net.ar/cuit/${cleanCuit}` },
    { name: 'cuit-online.com', url: `https://cuit-online.com/${cleanCuit}` },
    { name: 'dateas', url: `https://www.dateas.com/es/busca?q=${cleanCuit}` }
  ];

  for (const t of targets) {
    try {
      console.log(`Testing [${t.name}]: ${t.url}`);
      const res = await fetch(t.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8'
        }
      });
      console.log(`Status: ${res.status}`);
      if (res.ok) {
        const html = await res.text();
        console.log(`HTML Length: ${html.length}`);
        
        // Search for ALVAREZ or name
        if (html.toLowerCase().includes('alvarez') || html.toLowerCase().includes('leonora')) {
          console.log(`>>> FOUND NAME IN [${t.name}]!\n`);
        } else {
          console.log(`Preview: ${html.substring(0, 300)}\n`);
        }
      }
    } catch (e) {
      console.log(`Error [${t.name}]: ${e.message}\n`);
    }
  }
}

testOptions('27319516277');
