async function parseCuitOnline(cuit) {
  try {
    const url = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.cuitonline.com/search.php?q=${cuit}`)}`;
    console.log(`Fetching via CORS proxy: ${url}`);
    const res = await fetch(url);
    const json = await res.json();
    const html = json.contents;

    console.log("HTML Length:", html.length);

    // Extract title / name
    // Usually inside <span itemprop="name"> or <h1> or <a class="persona"...
    const nameMatch = html.match(/itemprop="name">([^<]+)<\/span>/i) || 
                      html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                      html.match(/<a class="persona"[^>]*>([^<]+)<\/a>/i) ||
                      html.match(/title="CUIT ([^"]+)"/i);
    console.log("Extracted Name Match:", nameMatch ? nameMatch[1].trim() : "Not found");

    // Extract Domicilio / Dirección
    const addressMatch = html.match(/itemprop="streetAddress">([^<]+)<\/span>/i) ||
                         html.match(/Domicilio:[^<]*<[^>]+>([^<]+)</i) ||
                         html.match(/class="domicilio"[^>]*>([^<]+)</i);
    console.log("Extracted Address Match:", addressMatch ? addressMatch[1].trim() : "Not found");

    // Extract Localidad / Provincia
    const locMatch = html.match(/itemprop="addressLocality">([^<]+)<\/span>/i) ||
                     html.match(/itemprop="addressRegion">([^<]+)<\/span>/i);
    console.log("Extracted Locality Match:", locMatch ? locMatch[1].trim() : "Not found");

    // Dump a snippet of persona details block if found
    const personaBlock = html.match(/<div class="persona"[^>]*>([\s+S\s\S]*?)<\/div>/i);
    if (personaBlock) {
      console.log("\nPersona Block snippet:\n", personaBlock[1].substring(0, 500));
    } else {
      // Find where CUIT is mentioned in HTML
      const idx = html.indexOf(cuit);
      if (idx !== -1) {
        console.log("\nSnippet around CUIT:\n", html.substring(Math.max(0, idx - 200), Math.min(html.length, idx + 500)));
      }
    }
  } catch (err) {
    console.error("Parse error:", err);
  }
}

parseCuitOnline('27319516277');
