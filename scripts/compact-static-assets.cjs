// Offline, lossless encoding changes. Does not resize or redraw artwork.
const fs = require('node:fs');
const zlib = require('node:zlib');
const report = [];

const flagsPath = 'src/assets/countryFlags.ts';
const flagsSource = fs.readFileSync(flagsPath, 'utf8');
if (!flagsSource.includes('PACKED_FLAGS')) {
    const original = JSON.parse(flagsSource.slice(flagsSource.indexOf(' = ') + 3, flagsSource.lastIndexOf(';')));
    const packed = zlib.gzipSync(Buffer.from(JSON.stringify(original)), { level: 9 }).toString('base64');
    const notice = fs.readFileSync('node_modules/fflate/LICENSE', 'utf8').trim();
    const next = `/*! fflate: ${notice}\n*/\n// flag-icons 7.6.0, MIT; see countryFlags.LICENSE. Losslessly packed for offline use.\nimport { gunzipSync, strFromU8 } from 'fflate';\nconst PACKED_FLAGS = ${JSON.stringify(packed)};\nlet flags: Readonly<Record<string, string>> | undefined;\nexport function getCountryFlag(code: string): string | undefined {\n    flags ??= JSON.parse(strFromU8(gunzipSync(Uint8Array.from(atob(PACKED_FLAGS), char => char.charCodeAt(0))))) as Record<string, string>;\n    return flags[code];\n}\n`;
    const unpacked = JSON.parse(zlib.gunzipSync(Buffer.from(packed, 'base64')).toString());
    if (JSON.stringify(unpacked) !== JSON.stringify(original)) throw new Error('Flag data changed');
    fs.writeFileSync(flagsPath, next);
    report.push({ file: flagsPath, before: Buffer.byteLength(flagsSource), after: Buffer.byteLength(next), lossless: true, flags: Object.keys(original).length });
}

const mapPath = 'src/assets/statisticsWorld.ts';
const mapSource = fs.readFileSync(mapPath, 'utf8');
const countries = JSON.parse(mapSource.slice(mapSource.indexOf(' = ') + 3, mapSource.lastIndexOf(';')));
let converted = false;
for (const country of countries) {
    if (country.path.includes('l')) continue;
    const rings = [...country.path.matchAll(/M([^M]+?)Z/g)].map(match => match[1].split('L').map(pair => pair.split(',').map(value => Math.round(Number(value) * 10))));
    country.path = rings.map(points => {
        let x = points[0][0], y = points[0][1];
        const deltas = points.slice(1).map(([nextX, nextY]) => { const pair = `${(nextX - x) / 10},${(nextY - y) / 10}`; x = nextX; y = nextY; return pair; });
        return `M${points[0][0] / 10},${points[0][1] / 10}${deltas.length ? 'l' + deltas.join(' ') : ''}Z`;
    }).join('');
    const decoded = [...country.path.matchAll(/M([^M]+?)Z/g)].map(match => {
        const [origin, relative = ''] = match[1].split('l'); let [x, y] = origin.split(',').map(value => Math.round(Number(value) * 10));
        return [[x, y], ...relative.split(' ').filter(Boolean).map(pair => { const [dx, dy] = pair.split(',').map(value => Math.round(Number(value) * 10)); x += dx; y += dy; return [x, y]; })];
    });
    if (JSON.stringify(decoded) !== JSON.stringify(rings)) throw new Error('Map geometry changed: ' + country.code);
    converted = true;
}
if (converted) {
    const next = mapSource.slice(0, mapSource.indexOf(' = ') + 3) + JSON.stringify(countries) + ';\n';
    fs.writeFileSync(mapPath, next);
    report.push({ file: mapPath, before: Buffer.byteLength(mapSource), after: Buffer.byteLength(next), lossless: true, countries: countries.length });
}

function crc32(bytes) {
    let crc = -1;
    for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    return (crc ^ -1) >>> 0;
}
function chunk(type, bytes) {
    const output = Buffer.alloc(bytes.length + 12); output.writeUInt32BE(bytes.length); output.write(type, 4); bytes.copy(output, 8);
    output.writeUInt32BE(crc32(output.subarray(4, bytes.length + 8)), bytes.length + 8); return output;
}
function predict(filter, a, b, c) {
    if (filter === 0) return 0; if (filter === 1) return a; if (filter === 2) return b; if (filter === 3) return Math.floor((a + b) / 2);
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c); return da <= db && da <= dc ? a : db <= dc ? b : c;
}
for (const name of ['bronze', 'silver', 'gold', 'platinum']) {
    const file = `src/assets/playstation/${name}.png`, original = fs.readFileSync(file);
    if (original[24] !== 8 || original[25] !== 6 || original[28] !== 0) throw new Error('Unsupported PNG encoding');
    const width = original.readUInt32BE(16), height = original.readUInt32BE(20), stride = width * 4;
    const chunks = []; for (let offset = 8; offset < original.length;) { const size = original.readUInt32BE(offset); chunks.push({ type: original.toString('ascii', offset + 4, offset + 8), data: original.subarray(offset + 8, offset + 8 + size) }); offset += size + 12; }
    const raw = zlib.inflateSync(Buffer.concat(chunks.filter(item => item.type === 'IDAT').map(item => item.data)));
    function decode(input) {
        const pixels = Buffer.alloc(stride * height);
        for (let y = 0; y < height; y++) for (let x = 0; x < stride; x++) {
            const i = y * stride + x, filter = input[y * (stride + 1)];
            pixels[i] = (input[y * (stride + 1) + x + 1] + predict(filter, x >= 4 ? pixels[i - 4] : 0, y ? pixels[i - stride] : 0, y && x >= 4 ? pixels[i - stride - 4] : 0)) & 255;
        }
        return pixels;
    }
    const pixels = decode(raw); let best = zlib.deflateSync(raw, { level: 9 });
    for (const strategy of [0, 1, 2, 3, 4, 'adaptive']) {
        const encoded = Buffer.alloc(raw.length);
        for (let y = 0; y < height; y++) {
            let bestRow, bestFilter = 0, bestScore = Infinity;
            for (const filter of strategy === 'adaptive' ? [0, 1, 2, 3, 4] : [strategy]) {
                const row = Buffer.alloc(stride); let score = 0;
                for (let x = 0; x < stride; x++) {
                    const i = y * stride + x;
                    row[x] = (pixels[i] - predict(filter, x >= 4 ? pixels[i - 4] : 0, y ? pixels[i - stride] : 0, y && x >= 4 ? pixels[i - stride - 4] : 0)) & 255;
                    score += Math.min(row[x], 256 - row[x]);
                }
                if (score < bestScore) { bestRow = row; bestFilter = filter; bestScore = score; }
            }
            encoded[y * (stride + 1)] = bestFilter; bestRow.copy(encoded, y * (stride + 1) + 1);
        }
        const candidate = zlib.deflateSync(encoded, { level: 9 }); if (candidate.length < best.length) best = candidate;
    }
    if (!decode(zlib.inflateSync(best)).equals(pixels)) throw new Error('PNG pixels changed: ' + file);
    let inserted = false; const outputChunks = [];
    for (const item of chunks) {
        if (item.type === 'IDAT') { if (!inserted) { outputChunks.push(chunk('IDAT', best)); inserted = true; } }
        else outputChunks.push(chunk(item.type, item.data));
    }
    const next = Buffer.concat([original.subarray(0, 8), ...outputChunks]);
    if (next.length < original.length) fs.writeFileSync(file, next);
    report.push({ file, before: original.length, after: Math.min(next.length, original.length), lossless: true, width, height });
}
fs.mkdirSync('docs/служебное/данные', { recursive: true });
fs.writeFileSync('docs/служебное/данные/asset-optimization.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
