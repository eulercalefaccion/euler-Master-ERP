async function test() {
  const cuits = ['27319516277', '30500010912'];

  for (const cuit of cuits) {
    console.log('\n=====================================');
    console.log('TESTING CUIT:', cuit);
    console.log('=====================================');

    // 1. cuitonline.com direct
    try {
      const res = await fetch(`https://www.cuitonline.com/search.php?q=${cuit}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36'
        }
      });
      const html = await res.text();
      console.log('cuitonline.com status:', res.status, 'HTML length:', html.length);
      const metaMatch = html.match(/meta name="description" content="[^"]*?\b([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*-\s*\d{11}/i) ||
                        html.match(/CuitOnline\.\s*([^-\d<]+)\s*-\s*\d{11}/i);
      console.log('cuitonline metaMatch:', metaMatch ? metaMatch[1].trim() : 'NONE');
    } catch (e) {
      console.error('cuitonline err:', e.message);
    }

    // 2. DuckDuckGo HTML
    try {
      const res = await fetch(`https://html.duckduckgo.com/html/?q=cuit+${cuit}+cuitonline`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36'
        }
      });
      const html = await res.text();
      console.log('DuckDuckGo HTML status:', res.status, 'len:', html.length);
      const match = html.match(/CuitOnline\.\s*([^-\d<]+)\s*-\s*\d{11}/i) ||
                    html.match(/([^-\d<]{3,50})\s*-\s*CUIT\s*\d{11}/i) ||
                    html.match(/result__snippet[^>]*>([^<]+)/i);
      console.log('DDG Match:', match ? match[1].trim() : 'NONE');
    } catch (e) {
      console.error('DDG err:', e.message);
    }

    // 3. ConstanciaAFIP / Argentina Open Data APIs
    const apis = [
      `https://afip.padron.ar/api/v1/persona/${cuit}`,
      `https://api.apis.net.ar/v1/cuit?cuit=${cuit}`,
      `https://api.sistemasagiles.com.ar/afip/cuit/${cuit}`
    ];
    for (const url of apis) {
      try {
        const res = await fetch(url);
        console.log(`API ${url} status:`, res.status);
        if (res.ok) {
          const json = await res.json();
          console.log('API response:', json);
        }
      } catch (e) {
        console.log(`API ${url} error:`, e.message);
      }
    }
  }
}

test();
