import { freeModelPool } from "@/lib/ai/router.server";
import { imageEditCapableModel } from "@/lib/ai/free";
const all = await freeModelPool("image");
console.log("image pool:", JSON.stringify(all.map(p=>({p:p.provider,m:p.models}))));
const cap = await freeModelPool("image", imageEditCapableModel);
console.log("edit pool:", JSON.stringify(cap.map(p=>({p:p.provider,m:p.models}))));
