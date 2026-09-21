import { editImage } from "@/lib/ai/router.server";
const src = await (await fetch("https://picsum.photos/seed/revora/768/768.jpg")).arrayBuffer();
const b = new Uint8Array(src);
let bin=""; for (let i=0;i<b.length;i+=0x8000) bin+=String.fromCharCode(...b.subarray(i,i+0x8000));
try {
  const r = await editImage({ task: "image.edit", organizationId: null, userId: null }, "same photo at dusk with warm lights", { dataUrl: btoa(bin), mimeType: "image/jpeg" });
  console.log("OK", r.provider, r.model, r.mimeType, r.base64.length);
} catch (e) { console.log("ERR", (e as any).category, (e as any).message); }
