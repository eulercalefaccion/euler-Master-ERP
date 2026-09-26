async function testFunctionFetch(cuit) {
  const cleanCuit = cuit.replace(/\D/g, '');
  
  // Test cuitonline HTML fetch with realistic headers
  try {
    const url = `https://www.cuitonline.com/search.php?q=${cleanCuit}`;
    console.log("Fetching:", url);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'max-age=0'
      }
    });

    console.log("Status:", res.status);
    const html = await res.text();
    console.log("HTML Length:", html.length);

    // Extract Razón Social / Nombre
    let name = '';
    const metaMatch = html.match(/meta name="description" content="[^"]*?\b([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*-\s*\d{11}/i) ||
                      html.match(/CuitOnline\.\s*([^-\d<]+)\s*-\s*\d{11}/i);

    if (metaMatch && metaMatch[1]) {
      name = metaMatch[1].replace(/regímenes y actividades con CuitOnline\.?/gi, '').trim();
    }

    if (!name || name.length < 3 || name.toLowerCase().includes('bloqueador')) {
      const h3Match = html.match(/<h3[^>]*>\s*([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*<\/h3>/i);
      if (h3Match && h3Match[1] && !h3Match[1].toLowerCase().includes('bloqueador')) {
        name = h3Match[1].trim();
      }
    }

    console.log(`>>> RESULT NAME FOR ${cleanCuit}: "${name.toUpperCase()}"\n`);
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testFunctionFetch('27319516277');
testFunctionFetch('30500010912');
