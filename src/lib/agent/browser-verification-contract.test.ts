import {describe,expect,it} from "vitest";
import {browserPlanIsBounded,createBrowserVerificationPlan} from "./browser-verification-contract";
describe("browser verification contract",()=>{it("creates bounded desktop/mobile evidence plans",()=>{const p=createBrowserVerificationPlan(["/","/about","/contact"]);expect(p.maxPages).toBe(3);expect(p.checks.length).toBe(42);expect(browserPlanIsBounded(p)).toBe(true);expect(p.readOnly).toBe(true);});});
