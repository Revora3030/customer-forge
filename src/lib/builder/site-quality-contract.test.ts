import {describe,expect,it} from "vitest";
import {evaluateSiteQuality} from "./site-quality-contract";
describe("site quality contract",()=>{it("blocks critical failures",()=>{const r=evaluateSiteQuality({routeIntegrity:true,meaningfulContent:true,placeholderFree:true,conversionPath:false,metadata:true,accessibility:true,mobileLayout:true,performance:true,secureResources:true,tenantSafety:true,runtimeClean:true});expect(r.passed).toBe(false);expect(r.blocking).toContain("conversion path");});});
