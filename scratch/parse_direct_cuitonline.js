async function testDetailedCuitOnline(cuit) {
  try {
    const url = `https://www.cuitonline.com/search.php?q=${cuit}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();

    // Find persona title or link
    const nameMatch = html.match(/meta name="description" content="[^"]*?\b([a-zA-Z\s]+)\s*-\s*\d{11}/i) ||
                      html.match(/<h3[^>]*>([^<]+)<\/h3>/i) ||
                      html.match(/<a class="hit"[^>]*>([^<]+)<\/a>/i);
    console.log("Extracted Name:", nameMatch ? nameMatch[1].trim() : "None");

    // Find domicile / address / provincia / localidad
    const domMatch = html.match(/Domicilio:[^<]*<[^>]+>([^<]+)</i) ||
                     html.match(/(?:Provincia|Localidad|Dirección|Domicilio)[^<]*:[^<]*<[^>]+>([^<]+)</i) ||
                     html.match(/class="(?:\w*-)?domicilio[^"]*"[^>]*>([^<]+)</i);
    console.log("Extracted Domicilio:", domMatch ? domMatch[1].trim() : "None");

    // Search for provincia / localidad text in html
    const provMatch = html.match(/(Santa Fe|Buenos Aires|Cordoba|Córdoba|Mendoza|Entre Rios|Entre Ríos|Rosario|Funes|Capital Federal|CABA)/i);
    console.log("Extracted Locality/Provincia:", provMatch ? provMatch[1] : "None");

    // Print all div text in search results
    const resultsMatch = html.match(/<div class="hit[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
    if (resultsMatch) {
      resultsMatch.forEach((r, i) => console.log(`Result ${i}:`, r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')));
    } else {
      console.log("Full text preview (first 1000 chars of body):");
      const bodyText = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      console.log(bodyText.substring(0, 1500));
    }
  } catch (e) {
    console.error(e);
  }
}

testDetailedCuitOnline('27319516277');
