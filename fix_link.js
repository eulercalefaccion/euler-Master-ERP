import fs from 'fs';
let c = fs.readFileSync('src/servicios_app/pages/Admin.jsx', 'utf8');
c = c.replace("const url = window.location.origin + '/'", "const url = 'https://eulerservicios.netlify.app/'");
fs.writeFileSync('src/servicios_app/pages/Admin.jsx', c);
console.log('Fixed link!');
