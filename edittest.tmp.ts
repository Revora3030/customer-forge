const acct = process.env["CLOUDFLARE_ACCOUNT_ID"]!; const key = process.env["CLOUDFLARE_AI_API_TOKEN"]!;
import { readFileSync } from "node:fs";
import { FULL_COVERAGE_MASK_PNG_BASE64 as M } from "@/lib/ai/providers/cloudflare-image";
const mask = Array.from(Uint8Array.from(atob(M), c=>c.charCodeAt(0)));
for (const f of ["/tmp/src.png","/tmp/src.jpg"]) {
  const buf = new Uint8Array(readFileSync(f));
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/runwayml/stable-diffusion-v1-5-inpainting`, { method:"POST", headers:{ authorization:`Bearer ${key}`, "content-type":"application/json" }, body: JSON.stringify({ prompt:"same photo at dusk", image: Array.from(buf), mask, strength:0.65, num_steps:20 }) });
  const ct = r.headers.get("content-type") ?? "";
  console.log(f, buf.length, r.status, ct.includes("json") ? (await r.text()).slice(0,150) : "IMAGE "+(await r.arrayBuffer()).byteLength);
}
