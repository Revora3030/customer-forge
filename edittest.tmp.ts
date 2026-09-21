const acct = process.env["CLOUDFLARE_ACCOUNT_ID"]!; const key = process.env["CLOUDFLARE_AI_API_TOKEN"] ?? process.env["CLOUDFLARE_API_TOKEN"]!;
import { FULL_COVERAGE_MASK_PNG_BASE64 } from "@/lib/ai/providers/cloudflare-image";
const mask = Array.from(Uint8Array.from(atob(FULL_COVERAGE_MASK_PNG_BASE64), c=>c.charCodeAt(0)));
const urls = ["https://picsum.photos/seed/a/512/512.jpg","https://picsum.photos/seed/a/1024/1024.jpg","https://picsum.photos/seed/a/512/512.webp","https://placehold.co/512x512.png"];
for (const u of urls) {
  const buf = new Uint8Array(await (await fetch(u)).arrayBuffer());
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/runwayml/stable-diffusion-v1-5-inpainting`, { method:"POST", headers:{ authorization:`Bearer ${key}`, "content-type":"application/json" }, body: JSON.stringify({ prompt:"same photo at dusk", image: Array.from(buf), mask, strength:0.65, num_steps:20 }) });
  const ct = r.headers.get("content-type") ?? "";
  console.log(u, buf.length, r.status, ct.includes("json") ? (await r.text()).slice(0,140) : (await r.arrayBuffer()).byteLength);
}
