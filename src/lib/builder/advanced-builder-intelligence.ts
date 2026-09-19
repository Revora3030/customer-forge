/**
 * Revora advanced builder intelligence bundle.
 * Covers roadmap areas 151-160 with deterministic, renderer-safe analysis.
 * No provider calls, DB writes, publishing, billing, or invented business facts.
 */
import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";

export type AdvancedArea =
  | "memory"
  | "elementEditing"
  | "premiumDesign"
  | "media"
  | "motion"
  | "responsive"
  | "accessibility"
  | "performance"
  | "seo"
  | "architecture";

export type AdvancedFinding = {
  area: AdvancedArea;
  priority: number;
  pageId: string | null;
  sectionId: string | null;
  message: string;
  repairable: boolean;
};

export type AdvancedAudit = {
  score: number;
  findings: AdvancedFinding[];
  areas: Record<AdvancedArea, number>;
  summary: string;
};

const AREAS: AdvancedArea[] = [
  "memory","elementEditing","premiumDesign","media","motion",
  "responsive","accessibility","performance","seo","architecture",
];

const clamp = (n:number) => Math.max(0, Math.min(100, Math.round(n)));
const visiblePages = (c:AgentContext) => c.pages.filter(p => p.is_visible && !p.noindex);
const sectionText = (s:AgentContext["pages"][number]["sections"][number]) =>
  [s.heading,s.subheading,s.body].map(v => v ?? "").join(" ").trim();

const tokens = (value:string) =>
  value.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2);

function requested(instruction:string, area:AdvancedArea):boolean {
  const t=instruction.toLowerCase();
  const patterns:Record<AdvancedArea,RegExp> = {
    memory:/\b(remember|again|continue|previous|earlier|keep|same as before)\b/i,
    elementEditing:/\b(button|headline|heading|text|copy|card|section|element|component|change this|edit this)\b/i,
    premiumDesign:/\b(premium|luxury|modern|beautiful|polished|wow|3d|high[- ]end|professional)\b/i,
    media:/\b(image|photo|photos|gallery|video|media|visual)\b/i,
    motion:/\b(animation|animated|motion|moving|hover|transition|parallax|3d|floating|effect)\b/i,
    responsive:/\b(mobile|tablet|responsive|desktop|phone|screen sizes)\b/i,
    accessibility:/\b(accessibility|accessible|a11y|contrast|keyboard|screen reader|alt text)\b/i,
    performance:/\b(performance|fast|speed|loading|lighthouse|optimize)\b/i,
    seo:/\b(seo|search|google|ranking|meta|canonical|keywords|local seo)\b/i,
    architecture:/\b(navigation|menu|architecture|structure|sitemap|links|orphan|sitewide|site-wide)\b/i,
  };
  return patterns[area].test(t);
}

export function auditAdvancedBuilderIntelligence(
  context:AgentContext,
  instruction:string,
  history:string[]=[],
):AdvancedAudit {
  const pages=visiblePages(context);
  const sections=pages.flatMap(p=>p.sections.filter(s=>s.is_visible));
  const components=sections.flatMap(s=>s.components);
  const findings:AdvancedFinding[]=[];
  const add=(f:AdvancedFinding)=>findings.length<48&&findings.push(f);

  const long=sections.filter(s=>sectionText(s).length>700);
  const dense=sections.filter(s=>s.components.length>8);
  const missingTitles=pages.filter(p=>!p.seo_title?.trim());
  const missingDescriptions=pages.filter(p=>!p.seo_description?.trim());
  const missingHeadings=sections.filter(s=>!s.heading?.trim());
  const mediaSections=sections.filter(s=>/^(gallery|reviews|portfolio|media|hero)$/i.test(s.kind));
  const mediaComponents=components.filter(c=>/^(image|gallery|video)$/i.test(c.kind));
  const ctaLike=components.filter(c=>/\b(book|quote|estimate|contact|call|get started|schedule|appointment|start|buy)\b/i.test((c.label??"")+" "+(c.link_label??"")));
  const pageUrls=new Set(pages.map(p=>p.slug?"/"+p.slug:"/"));
  const inbound=new Map<string,number>();
  for(const p of pages)for(const s of p.sections)for(const c of s.components)
    if(c.link_url?.startsWith("/")) inbound.set(c.link_url,(inbound.get(c.link_url)??0)+1);
  for(const p of pages) {
    if(p.kind!=="home" && (inbound.get(p.slug?"/"+p.slug:"/")??0)===0)
      add({area:"architecture",priority:86,pageId:p.id,sectionId:null,message:"Visible page has no detected inbound internal navigation link.",repairable:false});
    if(!p.seo_title?.trim())
      add({area:"seo",priority:95,pageId:p.id,sectionId:null,message:"Page is missing an SEO title signal.",repairable:true});
    if(!p.seo_description?.trim())
      add({area:"seo",priority:90,pageId:p.id,sectionId:null,message:"Page is missing an SEO description signal.",repairable:true});
  }
  for(const s of missingHeadings) add({area:"accessibility",priority:88,pageId:pages.find(p=>p.sections.some(x=>x.id===s.id))?.id??null,sectionId:s.id,message:"Visible section has no heading signal.",repairable:false});
  for(const s of long) add({area:"responsive",priority:78,pageId:pages.find(p=>p.sections.some(x=>x.id===s.id))?.id??null,sectionId:s.id,message:"Long copy should be checked at mobile and tablet widths.",repairable:false});
  for(const s of dense) add({area:"responsive",priority:82,pageId:pages.find(p=>p.sections.some(x=>x.id===s.id))?.id??null,sectionId:s.id,message:"Dense component layout warrants responsive breakpoint review.",repairable:false});
  if(requested(instruction,"media") && !mediaComponents.length)
    add({area:"media",priority:74,pageId:pages[0]?.id??null,sectionId:mediaSections[0]?.id??null,message:"The request calls for media, but no existing media component is available for a safe deterministic repair.",repairable:false});
  if(requested(instruction,"motion") && sections.length)
    add({area:"motion",priority:68,pageId:pages[0]?.id??null,sectionId:sections[0]?.id??null,message:"Motion intent detected; existing native section effects should be used rather than introducing a new runtime.",repairable:true});
  if(requested(instruction,"premiumDesign") && sections.length)
    add({area:"premiumDesign",priority:72,pageId:pages[0]?.id??null,sectionId:sections[0]?.id??null,message:"Premium visual intent detected; composition and native effects can be refined within the existing renderer.",repairable:true});
  if(requested(instruction,"performance") && components.length>40)
    add({area:"performance",priority:84,pageId:null,sectionId:null,message:"High component count warrants a performance pass before publishing.",repairable:false});
  if(requested(instruction,"memory") && history.length)
    add({area:"memory",priority:60,pageId:null,sectionId:null,message:"Prior user instructions are available to preserve continuity during this request.",repairable:true});
  if(requested(instruction,"elementEditing") && tokens(instruction).length>0)
    add({area:"elementEditing",priority:64,pageId:null,sectionId:null,message:"Element-level intent should resolve to the closest matching existing page, section, or component before editing.",repairable:true});

  const areas={} as Record<AdvancedArea,number>;
  for(const a of AREAS) areas[a]=100;
  areas.memory=history.length?95:80;
  areas.elementEditing=clamp(90-(components.length?0:15));
  areas.premiumDesign=clamp(sections.length?86:45);
  areas.media=clamp(mediaComponents.length?92:(mediaSections.length?75:55));
  areas.motion=80;
  areas.responsive=clamp(100-long.length*8-dense.length*8);
  areas.accessibility=clamp(100-missingHeadings.length*10);
  areas.performance=clamp(100-(components.length>60?25:components.length>40?15:0));
  areas.seo=clamp(100-missingTitles.length*12-missingDescriptions.length*10);
  areas.architecture=clamp(100-findings.filter(f=>f.area==="architecture").length*12);

  const score=clamp(AREAS.reduce((sum,a)=>sum+areas[a],0)/AREAS.length);
  return {
    score,
    findings,
    areas,
    summary:"Advanced builder intelligence: "+score+"/100 across "+AREAS.length+" roadmap areas; "+findings.length+" deterministic finding(s).",
  };
}

export function advancedBuilderSummary(a:AdvancedAudit):string{return a.summary;}

export function compileAdvancedSafeRepairs(
  context:AgentContext,
  instruction:string,
  cap=8,
):AgentAction[] {
  const audit=auditAdvancedBuilderIntelligence(context,instruction);
  const out:AgentAction[]=[];
  for(const f of audit.findings.filter(x=>x.repairable && x.area==="seo")) {
    if(out.length>=cap) break;
    const p=context.pages.find(x=>x.id===f.pageId);
    if(!p) continue;
    out.push({
      type:"set_page",
      pageId:p.id,
      patch:{
        seo_title:p.seo_title?.trim() || p.title.slice(0,60),
        seo_description:p.seo_description?.trim() || p.title.slice(0,160),
      },
    });
  }
  return out;
}
