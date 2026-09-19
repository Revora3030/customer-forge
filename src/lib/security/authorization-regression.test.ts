import {describe,expect,it} from "vitest";
import {buildAuthorizationMatrix,hasCrossTenantNegativeCoverage} from "./authorization-regression";
describe("authorization regression",()=>{it("generates negative cross-tenant cases",()=>{const cases=buildAuthorizationMatrix([{resource:"leads",action:"read",allowed:["tenant_user","tenant_admin"],tenantScoped:true}]);expect(hasCrossTenantNegativeCoverage(cases)).toBe(true);expect(cases.some(c=>c.actor==="tenant_user"&&!c.sameTenant&&c.expected==="deny")).toBe(true);});});
