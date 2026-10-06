// Build the Chrome Web Store upload: dist/npv-chat-showcase-<version>.zip with manifest.json at the root.
// Run: npm run package
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => !entry.name.startsWith('.'))
    .flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
const entries = files(root).map(file => path.relative(root, file).split(path.sep).join('/')).sort();

// Every file the manifest names must be in the package.
const referenced = [
  manifest.background.service_worker, manifest.action.default_popup,
  ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon),
  ...manifest.content_scripts.flatMap(script => [...(script.js || []), ...(script.css || [])])
];
const missing = referenced.filter(name => !entries.includes(name));
if (missing.length) throw new Error(`manifest references missing files: ${missing.join(', ')}`);
if (manifest.description.length > 132) throw new Error('description must be 132 characters or fewer');
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version)) throw new Error(`invalid version ${manifest.version}`);

const DOS_TIME = 0;            // 00:00:00
const DOS_DATE = (45 << 9) | (1 << 5) | 1; // 2025-01-01, fixed so builds are reproducible
const locals = [];
const central = [];
let offset = 0;
for (const name of entries) {
  const data = fs.readFileSync(path.join(root, name));
  const packed = zlib.deflateRawSync(data, { level: 9 });
  const nameBytes = Buffer.from(name, 'utf8');
  const crc = zlib.crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(8, 8); header.writeUInt16LE(DOS_TIME, 10); header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(crc, 14); header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBytes.length, 26); header.writeUInt16LE(0, 28);
  locals.push(header, nameBytes, packed);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6);
  record.writeUInt16LE(0x0800, 8); record.writeUInt16LE(8, 10); record.writeUInt16LE(DOS_TIME, 12);
  record.writeUInt16LE(DOS_DATE, 14); record.writeUInt32LE(crc, 16); record.writeUInt32LE(packed.length, 20);
  record.writeUInt32LE(data.length, 24); record.writeUInt16LE(nameBytes.length, 28); record.writeUInt32LE(offset, 42);
  central.push(record, nameBytes);
  offset += header.length + nameBytes.length + packed.length;
}
const directory = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);

const outDir = path.join(__dirname, '..', 'dist');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `npv-chat-showcase-${manifest.version}.zip`);
fs.writeFileSync(out, Buffer.concat([...locals, directory, end]));
console.log(`${path.relative(process.cwd(), out)} (${entries.length} files, ${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
console.log(entries.map(name => `  ${name}`).join('\n'));
