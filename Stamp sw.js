// Runs automatically after `npm run build` (npm "postbuild" script).
// Gives every build its own service worker version, so players receive the
// update banner and old caches are cleaned up.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'build', 'service-worker.js');
if (!fs.existsSync(file)) {
  console.warn('stamp-sw: build/service-worker.js not found, skipping.');
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
const source = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file, source.replace('__BUILD_ID__', stamp));
console.log(`stamp-sw: service worker build id ${stamp}`);