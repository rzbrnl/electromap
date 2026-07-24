// Generate simple PWA icons using canvas
// Run: node generate-icons.js

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function generateIcon(size, outputPath) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.2);
  ctx.fill();
  
  // Lightning bolt
  const scale = size / 192;
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  const cx = size / 2;
  const cy = size / 2;
  const bolt = [
    [cx + 10*scale, cy - 40*scale],
    [cx - 20*scale, cy + 5*scale],
    [cx + 5*scale, cy + 5*scale],
    [cx - 10*scale, cy + 40*scale],
    [cx + 20*scale, cy - 5*scale],
    [cx - 5*scale, cy - 5*scale]
  ];
  ctx.moveTo(bolt[0][0], bolt[0][1]);
  for (let i = 1; i < bolt.length; i++) {
    ctx.lineTo(bolt[i][0], bolt[i][1]);
  }
  ctx.closePath();
  ctx.fill();
  
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Generated: ${outputPath} (${size}x${size})`);
}

try {
  generateIcon(192, path.join(__dirname, 'icons', 'icon-192.png'));
  generateIcon(512, path.join(__dirname, 'icons', 'icon-512.png'));
} catch (e) {
  console.log('Canvas not available, creating placeholder SVG icons instead');
  // Fallback: create SVG files
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
    <rect width="192" height="192" rx="38" fill="#0f172a"/>
    <polygon points="112,52 72,92 97,92 87,140 117,100 92,100" fill="#22c55e"/>
  </svg>`;
  fs.writeFileSync(path.join(__dirname, 'icons', 'icon-192.svg'), svg);
  fs.writeFileSync(path.join(__dirname, 'icons', 'icon-512.svg'), svg);
  console.log('Created SVG fallback icons (rename to .png or use SVG in manifest)');
}
