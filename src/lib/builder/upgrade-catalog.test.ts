import { describe, expect, it } from "vitest";
import { audit246Upgrades, UPGRADE_CATALOG, UPGRADE_COUNT } from "./upgrade-catalog";
import type { AgentContext } from "@/lib/site-agent.server";
const context={pages:[{id:"home",slug:"/",title:"Home",kind:"home",sections:[]}]} as unknown as AgentContext;
describe("246-upgrade matrix",()=>{
 it("contains exactly 246 uniquely identified upgrades",()=>{
  expect(UPGRADE_COUNT).toBe(246); expect(UPGRADE_CATALOG).toHaveLength(246);
  expect(new Set(UPGRADE_CATALOG.map(u=>u.id)).size).toBe(246);
  expect(new Set(UPGRADE_CATALOG.map(u=>u.name)).size).toBe(246);
 });
 it("separates deterministic capabilities from runtime evidence",()=>{
  const audit=audit246Upgrades(context,"make the site premium, fast, accessible and secure");
  expect(audit.total).toBe(246); expect(audit.active.length).toBeGreaterThan(0);
  expect(audit.runtimeRequired.length).toBeGreaterThan(0); expect(audit.evidenceRequired.length).toBeGreaterThan(0);
 });
});
