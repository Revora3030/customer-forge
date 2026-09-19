import {describe,expect,it} from "vitest";
import {canonicalizeLifecycleEvent,isLifecycleTransitionAllowed} from "./lifecycle-contract";
describe("lifecycle contract",()=>{it("keeps lifecycle transitions explicit",()=>{expect(isLifecycleTransitionAllowed("visitor","account")).toBe(true);expect(isLifecycleTransitionAllowed("paid","account")).toBe(false);expect(canonicalizeLifecycleEvent({event:"trial_started",entityId:" org-1 ",occurredAt:"2026-09-19T12:00:00Z",idempotencyKey:" x ",source:"server"}).entityId).toBe("org-1");});});
