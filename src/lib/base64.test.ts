import { describe, expect, it } from "vitest";
import { decodeBase64Bytes, encodeBase64Bytes } from "@/lib/base64";
import { arrayBufferFromBytes, bytesFromDataUrl } from "@/lib/ai/providers/shared";

describe("runtime-neutral base64 helpers", () => {
  it("round trips arbitrary bytes without browser globals", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 127, 128, 253, 254, 255]);
    const encoded = encodeBase64Bytes(bytes);
    expect(encoded).toBe("AAECA3+A/f7/");
    expect([...decodeBase64Bytes(encoded)]).toEqual([...bytes]);
  });

  it("decodes data URLs and ignores whitespace", () => {
    const decoded = decodeBase64Bytes("data:image/png;base64, iVBOR\nw0KGgo= ");
    expect([...decoded.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect([...bytesFromDataUrl("data:image/png;base64,iVBORw0KGgo=").slice(0, 8)]).toEqual([
      137,
      80,
      78,
      71,
      13,
      10,
      26,
      10,
    ]);
  });

  it("copies bytes into a plain ArrayBuffer for Blob/FormData boundaries", () => {
    const source = new Uint8Array([10, 20, 30]);
    const buffer = arrayBufferFromBytes(source);
    source[0] = 99;
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(buffer)]).toEqual([10, 20, 30]);
  });
});