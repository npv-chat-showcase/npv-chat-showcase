// Build the store uploads from extension/, each with manifest.json at the root:
//   dist/npv-chat-showcase-<version>.zip          Chrome Web Store
//   dist/npv-chat-showcase-firefox-<version>.zip  Firefox Add-ons (same files, Firefox manifest)
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

// Firefox has no background service worker, and new add-ons must declare data sent off the device:
// Twitch usernames shown on the page go to NoPixel's companion API and Twitch to look up displays.
// 128 added content_scripts "world"; data_collection_permissions needs 140 (Android: 142).
function firefoxManifest(source) {
  const result = structuredClone(source);
  delete result.minimum_chrome_version;
  result.background = { scripts: [source.background.service_worker] };
  result.browser_specific_settings = { gecko: {
    id: 'npv-chat-showcase@npv-chat-showcase.github.io',
    strict_min_version: '140.0',
    data_collection_permissions: { required: ['websiteContent'] }
  }, gecko_android: { strict_min_version: '142.0' } };
  return result;
}

const DOS_TIME = 0;            // 00:00:00
const DOS_DATE = (45 << 9) | (1 << 5) | 1; // 2025-01-01, fixed so builds are reproducible
function zip(contents) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of contents) {
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
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(contents.length, 8); end.writeUInt16LE(contents.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const outDir = path.join(__dirname, '..', 'dist');
fs.mkdirSync(outDir, { recursive: true });
const contents = entries.map(name => [name, fs.readFileSync(path.join(root, name))]);
const builds = [
  [`npv-chat-showcase-${manifest.version}.zip`, contents],
  [`npv-chat-showcase-firefox-${manifest.version}.zip`, contents.map(([name, data]) =>
    [name, name === 'manifest.json' ? Buffer.from(JSON.stringify(firefoxManifest(manifest), null, 2) + '\n') : data])]
];
for (const [file, build] of builds) {
  const out = path.join(outDir, file);
  fs.writeFileSync(out, zip(build));
  console.log(`${path.relative(process.cwd(), out)} (${build.length} files, ${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
}
console.log(entries.map(name => `  ${name}`).join('\n'));
