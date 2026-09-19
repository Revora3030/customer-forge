import { describe, expect, it } from "vitest";
import type { AgentContext } from "@/lib/site-agent.server";
import { findOptimizationOpportunities } from "./optimization-intelligence";

describe("optimization intelligence",()=>{it("is deterministic and bounded",()=>{
 const context={sectionKinds:["hero","services"],pageKinds:["home"],componentKinds:["button"],business:{name:"Test",industry:"Services",tagline:"Test",description:"Test",city:null,state:null,serviceArea:null,phone:null,email:null,yearsInBusiness:null,primaryColor:null,secondaryColor:null,accentColor:null,fontPreference:null,services:[],publishedReviewCount:0,photoCount:0},pages:[{id:"p1",slug:"home",title:"Home",kind:"home",is_visible:true,noindex:false,seo_title:null,seo_description:null,sections:[{id:"s1",kind:"hero",variant:"default",is_visible:true,heading:"Welcome",subheading:null,body:"",sort_order:0,components:[{id:"c1",kind:"button",label:"Book",body:null,link_label:"Book",link_url:"/book",sort_order:0}]}]}]} as AgentContext;
 const a=findOptimizationOpportunities(context,"optimize"); const b=findOptimizationOpportunities(context,"optimize");
 expect(a).toEqual(b); expect(a.length).toBeLessThanOrEqual(32); expect(a.some(x=>x.area==="seo")).toBe(true);
});});
