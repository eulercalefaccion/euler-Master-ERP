async function testGoogleCuit(cuit) {
  const cleanCuit = cuit.replace(/\D/g, '');
  const url = `https://www.google.com/search?q=cuit+${cleanCuit}&hl=es`;

  try {
    console.log(`Searching Google for CUIT ${cleanCuit}...`);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8'
      }
    });

    const html = await res.text();
    console.log("HTML length:", html.length);

    // Search for titles or snippet text in Google results
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    const idx = text.indexOf(cleanCuit);
    if (idx !== -1) {
      console.log("Snippet around CUIT:\n", text.substring(Math.max(0, idx - 100), Math.min(text.length, idx + 400)));
    }

    // Match name in Google snippets (e.g. "alvarez cindea leonora", "cuitonline", "afip")
    const titleMatch = html.match(/<h3[^>]*>([^<]+)<\/h3>/gi);
    if (titleMatch) {
      console.log("\nHeadings found:");
      titleMatch.forEach(h => console.log(h.replace(/<[^>]+>/g, '')));
    }
  } catch (e) {
    console.error("Google Search Error:", e);
  }
}

testGoogleCuit('27319516277');
testGoogleCuit('30500010912');
