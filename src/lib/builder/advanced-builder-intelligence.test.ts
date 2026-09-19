import { describe, expect, it } from "vitest";
import { auditAdvancedBuilderIntelligence, compileAdvancedSafeRepairs } from "./advanced-builder-intelligence";
import type { AgentContext } from "@/lib/site-agent.server";

const context:AgentContext={
 business:{name:"Test Co",industry:"Home Services",tagline:"Reliable service",description:"",city:"",state:"",serviceArea:"",phone:"",email:"",yearsInBusiness:null,primaryColor:"#111111",secondaryColor:"#222222",accentColor:"#333333",fontPreference:"",services:[],publishedReviewCount:0,photoCount:0},
 pages:[{id:"home",slug:"",title:"Home",kind:"home",is_visible:true,noindex:false,seo_title:null,seo_description:null,sections:[
  {id:"hero",kind:"hero",variant:"default",is_visible:true,heading:"",subheading:null,body:null,sort_order:0,components:[
   {id:"cta",kind:"button",label:"Get Started",body:null,link_label:"Get Started",link_url:"/contact",sort_order:0}
  ]},
 ]}],
 sectionKinds:["hero","cta"],pageKinds:["home","custom"],componentKinds:["button","text","image"],
};

describe("advanced builder intelligence",()=>{
 it("is deterministic and bounded",()=>{
  const a=auditAdvancedBuilderIntelligence(context,"make the site premium, mobile friendly and better for SEO",["remember the brand tone"]);
  const b=auditAdvancedBuilderIntelligence(context,"make the site premium, mobile friendly and better for SEO",["remember the brand tone"]);
  expect(a).toEqual(b);
  expect(a.score).toBeGreaterThanOrEqual(0);
  expect(a.score).toBeLessThanOrEqual(100);
  expect(a.findings.length).toBeLessThanOrEqual(48);
 });
 it("repairs only missing SEO metadata",()=>{
  const actions=compileAdvancedSafeRepairs(context,"improve SEO",4);
  expect(actions).toHaveLength(1);
  expect(actions[0]?.type).toBe("set_page");
 });
});
