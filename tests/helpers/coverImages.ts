import { zlibSync } from 'fflate';

/** Complete, decodable fixtures, rather than byte signatures pretending to be images. */
export function onePixelPng(colour = 0): ArrayBuffer {
    const chunk = (name: string, data: Uint8Array): Uint8Array => {
        const result = new Uint8Array(data.length + 12), view = new DataView(result.buffer);
        view.setUint32(0, data.length); result.set([...name].map(char => char.charCodeAt(0)), 4); result.set(data, 8);
        let crc = 0xffffffff;
        for (const value of result.subarray(4, data.length + 8)) { crc ^= value; for (let i = 0; i < 8; i++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); }
        view.setUint32(data.length + 8, (crc ^ 0xffffffff) >>> 0); return result;
    };
    const header = new Uint8Array(13), view = new DataView(header.buffer); view.setUint32(0, 1); view.setUint32(4, 1); header[8] = 8; header[9] = 6;
    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlibSync(new Uint8Array([0, colour, 0, 0, 255]))), chunk('IEND', new Uint8Array())];
    const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; } return output.buffer;
}
