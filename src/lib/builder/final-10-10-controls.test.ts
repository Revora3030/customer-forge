import {describe,expect,it} from "vitest";
import {FINAL_10_10_CONTROLS,auditFinal10Controls} from "./final-10-10-controls";
describe("final 10/10 controls",()=>{it("contains a complete, unique control inventory",()=>{expect(FINAL_10_10_CONTROLS.length).toBe(120);expect(new Set(FINAL_10_10_CONTROLS.map(c=>c.id)).size).toBe(120);expect(auditFinal10Controls().categories.length).toBe(10);});});
