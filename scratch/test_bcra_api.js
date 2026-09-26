async function testBcraApi(cuit) {
  const cleanCuit = cuit.replace(/\D/g, '');
  const url = `https://api.bcra.gob.ar/centraldedeudores/v1.0/deudas/${cleanCuit}`;
  
  try {
    console.log(`Testing BCRA API for CUIT ${cleanCuit}: ${url}`);
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    console.log(`BCRA Status: ${res.status}`);
    const data = await res.json();
    console.log("BCRA Response:\n", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("BCRA API Error:", err.message);
  }
}

async function main() {
  await testBcraApi('27319516277');
  await testBcraApi('30500010912');
  await testBcraApi('20300000007');
}

main();
