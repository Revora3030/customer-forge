const acct = process.env["CLOUDFLARE_ACCOUNT_ID"]!; const key = process.env["CLOUDFLARE_AI_API_TOKEN"]!;
import { readFileSync } from "node:fs";
const buf = new Uint8Array(readFileSync("/tmp/src.jpg"));
for (const model of ["@cf/runwayml/stable-diffusion-v1-5-img2img","@cf/bytedance/stable-diffusion-xl-lightning","@cf/stabilityai/stable-diffusion-xl-base-1.0","@cf/lykon/dreamshaper-8-lcm"]) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${model}`, { method:"POST", headers:{ authorization:`Bearer ${key}`, "content-type":"application/json" }, body: JSON.stringify({ prompt:"same photo at dusk with warm lights", image: Array.from(buf), strength:0.65, num_steps:20 }) });
  const ct = r.headers.get("content-type") ?? "";
  console.log(model, r.status, ct.includes("json") ? (await r.text()).slice(0,130) : "IMAGE "+(await r.arrayBuffer()).byteLength);
}
