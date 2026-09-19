import type { AgentContext } from "@/lib/site-agent.server";
import type { AgentAction } from "@/lib/site-agent";

export type OptimizationArea =
  | "content" | "conversion" | "seo" | "responsive" | "accessibility"
  | "performance" | "architecture" | "trust" | "media" | "navigation";

export type OptimizationOpportunity = {
  area: OptimizationArea;
  priority: number;
  pageId: string | null;
  sectionId: string | null;
  reason: string;
  safe: boolean;
};

const CTA=/\b(book|quote|estimate|contact|call|get started|schedule|appointment)\b/i;
const INTERNAL=/^\/(?!\/)/;

export function findOptimizationOpportunities(context: AgentContext, instruction=""): OptimizationOpportunity[] {
  const pages=context.pages.filter(p=>p.is_visible&&!p.noindex);
  const opportunities: OptimizationOpportunity[]=[];
  for(const page of pages){
    if(!page.seo_title?.trim()) opportunities.push({area:"seo",priority:95,pageId:page.id,sectionId:null,reason:"Missing SEO title.",safe:true});
    if(!page.seo_description?.trim()) opportunities.push({area:"seo",priority:90,pageId:page.id,sectionId:null,reason:"Missing SEO description.",safe:true});
    for(const section of page.sections.filter(s=>s.is_visible)){
      const text=[section.heading,section.subheading,section.body].filter(Boolean).join(" ");
      if(text.length>700) opportunities.push({area:"content",priority:72,pageId:page.id,sectionId:section.id,reason:"Long content block may need responsive-friendly hierarchy.",safe:true});
      if(section.components.length>8) opportunities.push({area:"responsive",priority:78,pageId:page.id,sectionId:section.id,reason:"Dense component count may need responsive composition.",safe:true});
      const hasCta=section.components.some(c=>CTA.test([c.label,c.link_label].filter(Boolean).join(" "))||Boolean(c.link_url&&INTERNAL.test(c.link_url)));
      if(!hasCta && /^(hero|offer|cta|services|benefits)$/i.test(section.kind)) opportunities.push({area:"conversion",priority:88,pageId:page.id,sectionId:section.id,reason:"High-value section has no clear conversion action.",safe:true});
      if(/^(gallery|reviews|video)$/i.test(section.kind)&&section.components.length===0) opportunities.push({area:"media",priority:60,pageId:page.id,sectionId:section.id,reason:"Media-oriented section has no components.",safe:true});
    }
  }
  if(pages.length>1){
    const targets=new Set(pages.map(p=>"/s/"+p.slug).concat(pages.map(p=>"/"+p.slug)));
    const linked=new Set<string>();
    for(const p of pages) for(const s of p.sections) for(const c of s.components) if(c.link_url) linked.add(c.link_url);
    for(const target of targets) if(target!=="/"&&!linked.has(target)) opportunities.push({area:"navigation",priority:70,pageId:null,sectionId:null,reason:"A visible page has no detected inbound internal navigation link.",safe:true});
  }
  if(/\b(performance|speed|fast|optimize)\b/i.test(instruction)) opportunities.push({area:"performance",priority:65,pageId:null,sectionId:null,reason:"Performance optimization requested; deterministic source audit is ready.",safe:false});
  if(/\b(accessibility|accessible|a11y)\b/i.test(instruction)) opportunities.push({area:"accessibility",priority:80,pageId:null,sectionId:null,reason:"Accessibility optimization requested; runtime verification may still be required.",safe:false});
  return opportunities.sort((a,b)=>b.priority-a.priority).slice(0,32);
}

export function compileSafeOptimizationRepairs(context: AgentContext, instruction="", limit=8): AgentAction[] {
  const pages=new Map(context.pages.map(p=>[p.id,p]));
  const out:AgentAction[]=[];
  for(const o of findOptimizationOpportunities(context,instruction,)){
    if(!o.safe||out.length>=Math.min(12,Math.max(1,limit))) continue;
    if(o.area==="seo"&&o.pageId){
      const p=pages.get(o.pageId); if(!p) continue;
      out.push({type:"set_page",pageId:p.id,patch:{seo_title:p.seo_title?.trim()||p.title.slice(0,60),seo_description:p.seo_description?.trim()||p.title.slice(0,160)}});
    }
  }
  const seen=new Set<string>();
  return out.filter(a=>{const k=JSON.stringify(a);if(seen.has(k))return false;seen.add(k);return true;});
}

export function optimizationSummary(items: OptimizationOpportunity[]): string {
  const counts=new Map<string,number>(); for(const i of items) counts.set(i.area,(counts.get(i.area)||0)+1);
  return "Optimization intelligence: "+items.length+" opportunity(s) across "+[...counts.keys()].join(", ")+".";
}
