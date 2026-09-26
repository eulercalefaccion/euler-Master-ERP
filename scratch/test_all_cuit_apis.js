async function testCuit(cuit) {
  console.log(`Testing CUIT: ${cuit}`);
  
  // 1. cuitonline HTML direct or proxy
  try {
    const res = await fetch(`https://www.cuitonline.com/search.php?q=${cuit}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (res.ok) {
      const html = await res.text();
      const metaMatch = html.match(/meta name="description" content="[^"]*?\b([a-zA-Z\sÑñÁÉÍÓÚáéíóú]+)\s*-\s*\d{11}/i);
      const h3Match = html.match(/<h3[^>]*>\s*([a-zA-Z\sÑñÁÉÍÓÚáéíóú]+)\s*<\/h3>/i);
      const name = (metaMatch && metaMatch[1]) || (h3Match && h3Match[1]) || '';
      console.log(`cuitonline direct: Name="${name.trim()}"`);
    }
  } catch (e) {
    console.log("cuitonline direct failed:", e.message);
  }

  // 2. CORS proxies for frontend execution
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(`https://www.cuitonline.com/search.php?q=${cuit}`)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.cuitonline.com/search.php?q=${cuit}`)}`,
    `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(`https://www.cuitonline.com/search.php?q=${cuit}`)}`
  ];

  for (const p of proxies) {
    try {
      const res = await fetch(p);
      if (res.ok) {
        const text = await res.text();
        const metaMatch = text.match(/meta name="description" content="[^"]*?\b([a-zA-Z\sÑñÁÉÍÓÚáéíóú]+)\s*-\s*\d{11}/i) ||
                          text.match(/<h3[^>]*>\s*([a-zA-Z\sÑñÁÉÍÓÚáéíóú]+)\s*<\/h3>/i);
        if (metaMatch) {
          console.log(`Proxy ${p.substring(0, 30)}... SUCCESS Name="${metaMatch[1].trim()}"`);
          break;
        }
      }
    } catch (e) {
      console.log(`Proxy failed:`, e.message);
    }
  }
}

async function main() {
  await testCuit('27319516277');
  await testCuit('30500010912'); // Banco Galicia
  await testCuit('20300000007'); 
}

main();
