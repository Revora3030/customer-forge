const acct = process.env["CLOUDFLARE_ACCOUNT_ID"]!; const key = process.env["CLOUDFLARE_API_TOKEN"] ?? process.env["CLOUDFLARE_AI_TOKEN"]!;
import { FULL_COVERAGE_MASK_PNG_BASE64 } from "@/lib/ai/providers/cloudflare-image";
const src = new Uint8Array(await (await fetch("https://picsum.photos/seed/revora/768/768.jpg")).arrayBuffer());
console.log("src bytes", src.length, src[0], src[1]);
const mask = Uint8Array.from(atob(FULL_COVERAGE_MASK_PNG_BASE64), c=>c.charCodeAt(0));
for (const body of [
  { label: "img+mask", b: { prompt:"same photo at dusk", image: Array.from(src), mask: Array.from(mask), strength:0.65, num_steps:20 } },
  { label: "img only", b: { prompt:"same photo at dusk", image: Array.from(src), strength:0.65, num_steps:20 } },
]) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/runwayml/stable-diffusion-v1-5-inpainting`, { method:"POST", headers:{ authorization:`Bearer ${key}`, "content-type":"application/json" }, body: JSON.stringify(body.b) });
  const ct = r.headers.get("content-type") ?? "";
  console.log(body.label, r.status, ct, ct.includes("json") ? (await r.text()).slice(0,200) : (await r.arrayBuffer()).byteLength);
}
