import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key() {
  const secret = process.env["INSTAGRAM_CREDENTIAL_SECRET"];
  if (!secret) throw new Error("Instagram secure storage is not configured.");
  return createHash("sha256").update(secret).digest();
}
export const instagramHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const instagramNonce = () => randomBytes(32).toString("hex");
export function sealInstagramToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function openInstagramToken(value: string) {
  const buf = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}