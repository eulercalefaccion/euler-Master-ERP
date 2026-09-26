async function parseBingSnippets(cuit) {
  const cleanCuit = cuit.replace(/\D/g, '');
  const url = `https://www.bing.com/search?q=cuitonline+${cleanCuit}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8'
      }
    });

    const html = await res.text();

    // Look for text snippets in html containing names
    const text = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    console.log("=== BING TEXT SNIPPET ===");
    const idx = text.indexOf(cleanCuit);
    if (idx !== -1) {
      console.log(text.substring(Math.max(0, idx - 150), Math.min(text.length, idx + 300)));
    } else {
      console.log(text.substring(0, 500));
    }
  } catch (e) {
    console.error(e);
  }
}

parseBingSnippets('27319516277');
