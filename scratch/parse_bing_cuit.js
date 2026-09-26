async function parseBing(cuit) {
  const cleanCuit = cuit.replace(/\D/g, '');
  const url = `https://www.bing.com/search?q=cuit+${cleanCuit}`;

  try {
    console.log(`=== BING SEARCH FOR CUIT ${cleanCuit} ===`);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8'
      }
    });

    const html = await res.text();

    // Match <h2><a ...>Text</a></h2>
    const regex = /<h2[^>]*><a[^>]*>(.*?)<\/a><\/h2>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const title = match[1].replace(/<[^>]+>/g, '').trim();
      console.log("Bing Result Title:", title);
    }

    // Match meta description or snippets in <p class="b_algoSlug"...>
    const snippetRegex = /<p[^>]*class="b_algoSlug"[^>]*>(.*?)<\/p>/gi;
    while ((match = snippetRegex.exec(html)) !== null) {
      const snippet = match[1].replace(/<[^>]+>/g, '').trim();
      console.log("Bing Snippet:", snippet);
    }
  } catch (e) {
    console.error("Bing Error:", e);
  }
}

async function main() {
  await parseBing('27319516277');
  await parseBing('30500010912');
}

main();
