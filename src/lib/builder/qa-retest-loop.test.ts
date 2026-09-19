import { describe, expect, it } from "vitest";
import { compareVerification, MAX_AUTONOMOUS_ATTEMPTS } from "./qa-retest-loop";
import type { VerificationReport } from "@/lib/agent/verify";
const r=(score:number,critical:number,warnings:number):VerificationReport=>({
 score,critical,warnings,passed:1,checks:[],categories:{
 content:{passed:0,failed:0},seo:{passed:0,failed:0},accessibility:{passed:0,failed:0},conversion:{passed:0,failed:0},technical:{passed:0,failed:0},security:{passed:0,failed:0}},summary:""
});
describe("qa-retest-loop",()=>{it("passes clean results",()=>expect(compareVerification(r(80,1,1),r(100,0,0),1).outcome).toBe("pass"));it("retries bounded improvements",()=>{const d=compareVerification(r(70,2,2),r(80,1,1),1);expect(d.shouldRetry).toBe(true);expect(compareVerification(r(80,1,1),r(80,1,1),MAX_AUTONOMOUS_ATTEMPTS).shouldRetry).toBe(false)});it("rolls back regressions",()=>expect(compareVerification(r(90,0,0),r(70,1,1),1).shouldRollback).toBe(true));});
