import fs from 'fs';

const text = fs.readFileSync('clientes.txt', 'utf-8');
const lines = text.split('\n');

const results = [];

for(let line of lines) {
  if (!line.trim() || line.includes('Razón social') || line.includes('Buscar...') || line.startsWith('Terceros') || line.includes('Prioridad Alta')) {
    continue;
  }
  
  // Handling both tab spaces and possible spaces due strictly to copy formatting
  const columns = line.split('\t');
  if (columns.length < 5) continue;

  const role = columns[2] ? columns[2].trim() : '';
  if (role !== 'Cliente' && role !== 'Indistinto') continue;
  
  let name = columns[0] ? columns[0].trim() : '';
  if (!name && columns[1]) name = columns[1].trim();

  // capitalize helper
  const capitalize = (s) => s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  name = capitalize(name);

  let cuit = '';
  const identificacion = columns[6] ? columns[6].trim() : '';
  if (identificacion.includes('CUIT')) {
    cuit = identificacion.replace('CUIT', '').trim();
    if (cuit.length === 11) {
       cuit = `${cuit.slice(0,2)}-${cuit.slice(2,10)}-${cuit.slice(10,11)}`;
    }
  } else if (identificacion.includes('DNI')) {
    cuit = identificacion.replace('DNI', '').trim();
  } else {
    cuit = identificacion;
  }

  const catFiscal = columns[5] ? columns[5].trim().toLowerCase() : '';
  let priceList = 'Consumidor Final';
  if (catFiscal.includes('inscripto')) priceList = 'Mayorista';
  
  let type = 'Propietario';
  const uname = name.toUpperCase();
  if (uname.includes('ARQUITECTURA') || uname.includes('ARQ.') || uname.includes('ESTUDIO')) type = 'Estudio de Arquitectura';
  else if (uname.includes('CONSTRUCTORA') || uname.includes('CONSTRUCCIONES') || uname.includes(' S.A.') || uname.includes(' S.R.L.') || uname.includes(' S. A.') || uname.includes(' SRL') || uname.includes(' S.A') || uname.includes(' S.A.S.')) type = 'Constructora';

  results.push({
    name: name,
    type: type,
    cuit: cuit,
    email: '',
    phone: '',
    address: '',
    priceList: priceList,
    obrasCount: 0,
    ssttCount: 0
  });
}

const unique = [];
const seenNames = new Set();
for(const r of results) {
   const lowerName = r.name.toLowerCase();
   if (!seenNames.has(lowerName) && lowerName && lowerName !== 'cliente' && lowerName !== 'cliente consumidor final') {
      seenNames.add(lowerName);
      unique.push(r);
   }
}

fs.writeFileSync('public/clientes_gesdatta.json', JSON.stringify(unique, null, 2));
console.log(`Parsed ${unique.length} unique clients.`);
