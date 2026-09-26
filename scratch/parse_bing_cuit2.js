async function parseBing2(cuit) {
  const cleanCuit = cuit.replace(/\D/g, '');
  const url = `https://www.bing.com/search?q=cuitonline+${cleanCuit}`;

  try {
    console.log(`=== BING SEARCH FOR cuitonline ${cleanCuit} ===`);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8'
      }
    });

    const html = await res.text();

    const regex = /<h2[^>]*><a[^>]*>(.*?)<\/a><\/h2>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const title = match[1].replace(/<[^>]+>/g, '').trim();
      console.log("Bing Title:", title);
    }
  } catch (e) {
    console.error(e);
  }
}

parseBing2('27319516277');
