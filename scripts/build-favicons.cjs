const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const web = path.join(__dirname, '..', 'apps', 'web');
const svg = path.join(web, 'src', 'app', 'icon.svg');
const input = fs.readFileSync(svg);

// iOS home-screen icon: Next serves app/apple-icon.png and injects <link rel="apple-touch-icon">.
const raster = (size) => sharp(input, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

(async () => {
  // Single-band ICO (PNG-compressed entries are valid since Vista; every target browser reads them).
  const bands = [16, 32, 48];
  const pngs = [];
  for (const size of bands) pngs.push(await raster(size));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(bands.length, 4);

  const dir = Buffer.alloc(16 * bands.length);
  let offset = header.length + dir.length;
  bands.forEach((size, i) => {
    const at = i * 16;
    dir.writeUInt8(size === 256 ? 0 : size, at); // width (0 == 256)
    dir.writeUInt8(size === 256 ? 0 : size, at + 1); // height
    dir.writeUInt8(0, at + 2); // palette
    dir.writeUInt8(0, at + 3); // reserved
    dir.writeUInt16LE(1, at + 4); // colour planes
    dir.writeUInt16LE(32, at + 6); // bits per pixel
    dir.writeUInt32LE(pngs[i].length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += pngs[i].length;
  });

  fs.writeFileSync(path.join(web, 'public', 'favicon.ico'), Buffer.concat([header, dir, ...pngs]));
  fs.writeFileSync(path.join(web, 'src', 'app', 'apple-icon.png'), await raster(180));

  for (const size of [192, 512]) {
    fs.writeFileSync(path.join(web, 'public', `icon-${size}.png`), await raster(size));
  }

  console.log(`favicon.ico bands: ${bands.join(', ')}`);
  for (const f of ['public/favicon.ico', 'src/app/apple-icon.png', 'public/icon-192.png', 'public/icon-512.png']) {
    const p = path.join(web, f);
    console.log(`  ${f.padEnd(22)} ${fs.statSync(p).size} bytes`);
  }
})();