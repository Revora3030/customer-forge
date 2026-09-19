import {describe,expect,it} from "vitest";
import {classifyChangeImpact} from "./change-impact";
describe("change impact",()=>{it("elevates billing and RLS changes to critical",()=>{const r=classifyChangeImpact({files:["a.ts"],touchesAuth:false,touchesBilling:true,touchesSchema:false,touchesRls:true,touchesPublishing:false});expect(r.level).toBe("critical");expect(r.requiresExtraVerification).toBe(true);});});
