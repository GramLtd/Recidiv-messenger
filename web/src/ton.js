// Minimal BOC builder for a TON text-comment payload (single cell, no refs) — avoids pulling @ton/core + Buffer polyfills.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0x82f63b78 : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32c(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function commentPayload(text) {
  const data = [0, 0, 0, 0, ...new TextEncoder().encode(text)];
  if (data.length > 127) throw new Error('comment too long');
  const cell = [0x00, data.length * 2, ...data];
  const boc = [0xb5, 0xee, 0x9c, 0x72, 0x41, 0x01, 0x01, 0x01, 0x00, cell.length, 0x00, ...cell];
  const crc = crc32c(boc);
  boc.push(crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff);
  return btoa(String.fromCharCode(...boc));
}
