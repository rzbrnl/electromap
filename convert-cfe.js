const fs = require('fs');

const csv = fs.readFileSync('/Users/jzegnio/electromap/cfe-data.csv', 'utf8');
const lines = csv.split('\n').slice(1);

const data = lines.filter(l => l.trim()).map(line => {
  const parts = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { parts.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  parts.push(current.trim());
  return {
    cons: parts[0],
    nombre_estacion: parts[2] || '',
    direccion: parts[3] || '',
    ciudad: parts[5] || '',
    estado: parts[6] || '',
    lat: parseFloat(parts[8]) || 0,
    lng: parseFloat(parts[9]) || 0,
    electrolineras_totales: parts[10] || '0',
    tipo_01: parts[12] || '',
    potencia_01: parts[13] || ''
  };
}).filter(c => c.lat && c.lng);

fs.writeFileSync('/Users/jzegnio/electromap/cfe-data.json', JSON.stringify(data));
console.log('Converted', data.length, 'stations');
