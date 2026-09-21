import { editImage, freeModelPool } from "@/lib/ai/router.server";
import { imageEditCapableModel } from "@/lib/ai/free";
console.log("pool", JSON.stringify((await freeModelPool("image", imageEditCapableModel)).map(p=>p.models)));
const src = new Uint8Array(await (await fetch("https://picsum.photos/seed/revora/768/768.jpg")).arrayBuffer());
let bin=""; for (let i=0;i<src.length;i+=0x8000) bin+=String.fromCharCode(...src.subarray(i,i+0x8000));
try {
  const r = await editImage({ task: "image.edit", organizationId: null, userId: null }, "same photo at dusk with warm lights", { dataUrl: btoa(bin), mimeType: "image/jpeg" });
  console.log("OK", r.provider, r.model, r.mimeType, r.base64.length);
} catch (e) { console.log("ERR", (e as any).category, (e as any).detail, (e as any).message); }
console.log("pool after", JSON.stringify((await freeModelPool("image", imageEditCapableModel)).map(p=>p.models)));
