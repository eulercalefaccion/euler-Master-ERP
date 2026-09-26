async function testBrowserPadron(cuit) {
  const cleanCuit = cuit.replace(/\D/g, '');

  const urls = [
    { name: 'AllOrigins Json', url: `https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.cuitonline.com/search.php?q=${cleanCuit}`)}` },
    { name: 'CorsProxy.io', url: `https://corsproxy.io/?${encodeURIComponent(`https://www.cuitonline.com/search.php?q=${cleanCuit}`)}` },
    { name: 'ThingProxy', url: `https://thingproxy.freeboard.io/fetch/https://www.cuitonline.com/search.php?q=${cleanCuit}` },
    { name: 'Codetabs Proxy', url: `https://api.codetabs.com/v1/proxy?quest=https://www.cuitonline.com/search.php?q=${cleanCuit}` }
  ];

  for (const item of urls) {
    try {
      console.log(`Testing [${item.name}]: ${item.url}`);
      const res = await fetch(item.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      console.log(`Status: ${res.status}`);
      if (res.ok) {
        let text = await res.text();
        if (item.name.includes('Json') || item.name.includes('AllOrigins')) {
          try {
            const parsed = JSON.parse(text);
            text = parsed.contents || text;
          } catch(e) {}
        }
        console.log(`Length: ${text.length}`);
        
        // Extract name
        const metaMatch = text.match(/meta name="description" content="[^"]*?\b([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*-\s*\d{11}/i) ||
                          text.match(/<h3[^>]*>\s*([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*<\/h3>/i);
        if (metaMatch && metaMatch[1]) {
          const name = metaMatch[1].replace(/regímenes y actividades con CuitOnline\.?/gi, '').trim();
          console.log(`>>> EXTRACTED NAME: "${name.toUpperCase()}"\n`);
        } else {
          console.log(`Preview: ${text.substring(0, 200)}\n`);
        }
      }
    } catch (err) {
      console.log(`Error [${item.name}]: ${err.message}\n`);
    }
  }
}

testBrowserPadron('27319516277');
