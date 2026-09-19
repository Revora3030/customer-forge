import {describe,expect,it} from "vitest";
import {evaluateWebhookSafety} from "./webhook-safety";
describe("webhook safety",()=>{it("requires signature and tenant resolution",()=>{const r=evaluateWebhookSafety({signatureValid:false,eventId:"",alreadyProcessed:false,customerTenantResolved:false,eventType:""});expect(r.accepted).toBe(false);expect(r.reasons.length).toBe(4);});});
