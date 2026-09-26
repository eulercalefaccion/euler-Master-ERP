async function testCloudflareBypass(cuit) {
  const cleanCuit = cuit.replace(/\D/g, '');
  const url = `https://www.cuitonline.com/search.php?q=${cleanCuit}`;

  try {
    console.log(`Testing full browser headers on CUIT ${cleanCuit}: ${url}`);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    console.log("Status:", res.status);
    const html = await res.text();
    console.log("HTML length:", html.length);

    if (html.includes('Just a moment')) {
      console.log("CLOUDFLARE BLOCKED!");
    } else {
      console.log("SUCCESS! NO CLOUDFLARE BLOCK!");
      const metaMatch = html.match(/meta name="description" content="[^"]*?\b([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*-\s*\d{11}/i) ||
                        html.match(/CuitOnline\.\s*([^-\d<]+)\s*-\s*\d{11}/i);
      let name = '';
      if (metaMatch && metaMatch[1]) {
        name = metaMatch[1].replace(/regímenes y actividades con CuitOnline\.?/gi, '').trim();
      }
      console.log(`>>> EXTRACTED NAME: "${name.toUpperCase()}"\n`);
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

async function main() {
  await testCloudflareBypass('27319516277');
  await testCloudflareBypass('30500010912');
}

main();
