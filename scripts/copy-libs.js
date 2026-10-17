// Chép three.js (r147) + OrbitControls + SheetJS từ node_modules vào web/lib (chạy sau `npm install`).
const fs = require('fs'), path = require('path');
const map = [
  ['node_modules/three/build/three.min.js', 'web/lib/three.min.js'],
  ['node_modules/three/examples/js/controls/OrbitControls.js', 'web/lib/OrbitControls.js'],
  ['node_modules/xlsx/dist/xlsx.full.min.js', 'web/lib/xlsx.full.min.js'],
];
fs.mkdirSync('web/lib', { recursive: true });
for (const [a, b] of map) {
  if (!fs.existsSync(a)) { console.error('Thiếu', a, '— chạy npm install trước'); process.exit(1); }
  fs.copyFileSync(a, b); console.log('OK', b);
}
