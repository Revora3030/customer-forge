/**
 * Runtime-neutral base64 helpers.
 *
 * Server code runs outside the browser, so image storage must not rely on
 * `atob`/`btoa`. These helpers use only byte arrays and strings, which work in
 * tests, SSR and the deployed server runtime.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = new Map([...ALPHABET].map((char, index) => [char, index]));

function normalizeBase64(input: string): string {
  const comma = input.indexOf(",");
  return (comma >= 0 ? input.slice(comma + 1) : input).replace(/\s+/g, "");
}

export function decodeBase64Bytes(input: string): Uint8Array {
  const base64 = normalizeBase64(input);
  if (!base64) return new Uint8Array();
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const outputLength = Math.max(Math.floor((base64.length * 3) / 4) - padding, 0);
  const bytes = new Uint8Array(outputLength);
  let byteIndex = 0;

  for (let index = 0; index < base64.length; index += 4) {
    const chunk = base64.slice(index, index + 4).padEnd(4, "=");
    const a = LOOKUP.get(chunk[0] ?? "") ?? 0;
    const b = LOOKUP.get(chunk[1] ?? "") ?? 0;
    const c = chunk[2] === "=" ? 0 : (LOOKUP.get(chunk[2] ?? "") ?? 0);
    const d = chunk[3] === "=" ? 0 : (LOOKUP.get(chunk[3] ?? "") ?? 0);
    const triple = (a << 18) | (b << 12) | (c << 6) | d;
    if (byteIndex < outputLength) bytes[byteIndex] = (triple >> 16) & 0xff;
    byteIndex += 1;
    if (byteIndex < outputLength) bytes[byteIndex] = (triple >> 8) & 0xff;
    byteIndex += 1;
    if (byteIndex < outputLength) bytes[byteIndex] = triple & 0xff;
    byteIndex += 1;
  }

  return bytes;
}

export function encodeBase64Bytes(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    output += ALPHABET[(triple >> 18) & 0x3f] ?? "A";
    output += ALPHABET[(triple >> 12) & 0x3f] ?? "A";
    output += index + 1 < bytes.length ? (ALPHABET[(triple >> 6) & 0x3f] ?? "A") : "=";
    output += index + 2 < bytes.length ? (ALPHABET[triple & 0x3f] ?? "A") : "=";
  }
  return output;
}