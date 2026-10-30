/**
 * Reads a picture's pixel size from its first bytes (PNG, JPEG, WebP, GIF)
 * without decoding it, so the starter-picture gate can tell a sharp hero from
 * an undersized one. Pure and dependency-free; unknown formats return null.
 */
export type ImageDimensions = { width: number; height: number };

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u16le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, i: number) => u16le(b, i) | ((b[i + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, i: number) => ((u16be(b, i) << 16) >>> 0) + u16be(b, i + 2);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

const sane = (width: number, height: number): ImageDimensions | null =>
  width > 0 && height > 0 && width <= 65535 && height <= 65535 ? { width, height } : null;

export function readImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24) return null;
  // PNG: signature, then the IHDR chunk carries width/height.
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG" && ascii(bytes, 12, 4) === "IHDR")
    return sane(u32be(bytes, 16), u32be(bytes, 20));
  // GIF: logical screen size.
  if (ascii(bytes, 0, 3) === "GIF") return sane(u16le(bytes, 6), u16le(bytes, 8));
  // WebP: RIFF container with a VP8 / VP8L / VP8X chunk.
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === "VP8 " && bytes.length >= 30) return sane(u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff);
    if (chunk === "VP8L" && bytes.length >= 25) {
      const b0 = bytes[21] ?? 0, b1 = bytes[22] ?? 0, b2 = bytes[23] ?? 0, b3 = bytes[24] ?? 0;
      return sane(1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)));
    }
    if (chunk === "VP8X" && bytes.length >= 30) return sane(1 + u24le(bytes, 24), 1 + u24le(bytes, 27));
    return null;
  }
  // JPEG: walk the segments to the first start-of-frame marker.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i += 1; continue; }
      const marker = bytes[i + 1] ?? 0;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const length = u16be(bytes, i + 2);
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return sane(u16be(bytes, i + 7), u16be(bytes, i + 5));
      if (length < 2) return null;
      i += 2 + length;
    }
  }
  return null;
}
