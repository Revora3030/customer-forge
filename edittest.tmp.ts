const acct = process.env["CLOUDFLARE_ACCOUNT_ID"]!; const key = process.env["CLOUDFLARE_AI_API_TOKEN"] ?? process.env["CLOUDFLARE_API_TOKEN"]!;
import { FULL_COVERAGE_MASK_PNG_BASE64 as M } from "@/lib/ai/providers/cloudflare-image";
const maskBytes = Array.from(Uint8Array.from(atob(M), c=>c.charCodeAt(0)));
const buf = new Uint8Array(await (await fetch("https://picsum.photos/seed/a/512/512.jpg")).arrayBuffer());
let bin=""; for (let i=0;i<buf.length;i+=0x8000) bin+=String.fromCharCode(...buf.subarray(i,i+0x8000));
const b64 = btoa(bin);
const variants: Record<string, unknown>[] = [
  { prompt:"same photo at dusk", image_b64: b64, mask_image: M, strength:0.65, num_steps:20 },
  { prompt:"same photo at dusk", image: Array.from(buf), mask_image: maskBytes, strength:0.65, num_steps:20 },
  { prompt:"same photo at dusk", image_b64: b64, mask: maskBytes, strength:0.65, num_steps:20 },
  { prompt:"same photo at dusk", image_b64: b64, strength:0.65, num_steps:20 },
];
for (const [i,b] of variants.entries()) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/runwayml/stable-diffusion-v1-5-inpainting`, { method:"POST", headers:{ authorization:`Bearer ${key}`, "content-type":"application/json" }, body: JSON.stringify(b) });
  const ct = r.headers.get("content-type") ?? "";
  console.log(i, Object.keys(b).join(","), r.status, ct.includes("json") ? (await r.text()).slice(0,160) : "IMAGE "+(await r.arrayBuffer()).byteLength);
}
