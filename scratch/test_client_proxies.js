async function testClientProxy(cuit) {
  const cleanCuit = cuit.replace(/\D/g, '');

  const proxies = [
    { name: 'Codetabs', url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(`https://www.cuitonline.com/search.php?q=${cleanCuit}`)}` },
    { name: 'AllOrigins', url: `https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.cuitonline.com/search.php?q=${cleanCuit}`)}` }
  ];

  for (const p of proxies) {
    try {
      console.log(`Testing [${p.name}]: ${p.url}`);
      const res = await fetch(p.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      console.log(`Status: ${res.status}`);
      if (res.ok) {
        let text = await res.text();
        if (p.name === 'AllOrigins') {
          try {
            const data = JSON.parse(text);
            text = data.contents || text;
          } catch(e){}
        }

        console.log("Response length:", text.length);

        const metaMatch = text.match(/meta name="description" content="[^"]*?\b([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*-\s*\d{11}/i) ||
                          text.match(/CuitOnline\.\s*([^-\d<]+)\s*-\s*\d{11}/i);
        let name = '';
        if (metaMatch && metaMatch[1]) {
          name = metaMatch[1].replace(/regímenes y actividades con CuitOnline\.?/gi, '').trim();
        }

        if (!name || name.length < 3 || name.toLowerCase().includes('bloqueador')) {
          const h3Match = text.match(/<h3[^>]*>\s*([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*<\/h3>/i);
          if (h3Match && h3Match[1] && !h3Match[1].toLowerCase().includes('bloqueador')) {
            name = h3Match[1].trim();
          }
        }

        if (name) {
          console.log(`>>> SUCCESS NAME: "${name.toUpperCase()}"\n`);
          break;
        } else {
          console.log("No name extracted in response\n");
        }
      }
    } catch (e) {
      console.log(`Error [${p.name}]:`, e.message);
    }
  }
}

testClientProxy('27319516277');
