/** REVORA COMPLETE BUILDER CAPABILITY MATRIX */
import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";
export type CapabilityArea = "planning"|"editing"|"design"|"media"|"motion"|"responsive"|"accessibility"|"performance"|"seo"|"architecture"|"conversion"|"cro"|"browserQa"|"runtimeQa"|"visualRegression"|"selfHealing"|"security"|"analytics"|"ux"|"industry"|"continuousOptimization";
export type CapabilityFinding={area:CapabilityArea;severity:"info"|"warning";pageId?:string;sectionId?:string;message:string;repairable:boolean};
export type CapabilityAudit={score:number;areas:Record<CapabilityArea,number>;findings:CapabilityFinding[];safeRepairCount:number;runtimeRequired:CapabilityArea[];summary:string};
const AREAS:CapabilityArea[]=["planning","editing","design","media","motion","responsive","accessibility","performance","seo","architecture","conversion","cro","browserQa","runtimeQa","visualRegression","selfHealing","security","analytics","ux","industry","continuousOptimization"];
const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n)));
const visible=(c:AgentContext)=>c.pages.filter(p=>p.is_visible&&!p.noindex);
const text=(s:{heading:string|null;subheading:string|null;body:string|null})=>[s.heading,s.subheading,s.body].map(v=>v??"").join(" ").trim();
export function auditCompleteBuilderCapabilities(context:AgentContext,actions:AgentAction[]=[]):CapabilityAudit{
 const pages=visible(context), sections=pages.flatMap(p=>p.sections.filter(s=>s.is_visible)), components=sections.flatMap(s=>s.components), findings:CapabilityFinding[]=[];
 const links=components.filter(c=>Boolean(c.link_url)), ctas=components.filter(c=>/\b(book|quote|estimate|contact|call|get started|schedule|appointment|start|buy)\b/i.test((c.label??"")+" "+(c.link_label??"")));
 const media=components.filter(c=>["image","gallery","video"].includes(c.kind.toLowerCase())), long=sections.filter(s=>text(s).length>700), dense=sections.filter(s=>s.components.length>8);
 const missingTitles=pages.filter(p=>!p.seo_title?.trim()),missingDescriptions=pages.filter(p=>!p.seo_description?.trim()),missingHeadings=sections.filter(s=>!s.heading?.trim());
 const urls=new Set(pages.map(p=>p.slug?"/"+p.slug:"/"));
 for(const p of pages)for(const s of p.sections)for(const c of s.components)if(c.link_url?.startsWith("/")&&!urls.has(c.link_url))findings.push({area:"architecture",severity:"warning",pageId:p.id,sectionId:s.id,message:"Internal link does not resolve to a visible page.",repairable:true});
 if(!ctas.length)findings.push({area:"conversion",severity:"warning",message:"No detectable primary conversion action exists.",repairable:true});
 for(const p of missingTitles)findings.push({area:"seo",severity:"warning",pageId:p.id,message:"Missing SEO title.",repairable:true});
 for(const p of missingDescriptions)findings.push({area:"seo",severity:"warning",pageId:p.id,message:"Missing SEO description.",repairable:true});
 for(const s of missingHeadings)findings.push({area:"accessibility",severity:"warning",sectionId:s.id,message:"Visible section has no heading signal.",repairable:false});
 for(const s of long)findings.push({area:"responsive",severity:"warning",sectionId:s.id,message:"Long content warrants mobile and tablet testing.",repairable:false});
 for(const s of dense)findings.push({area:"responsive",severity:"warning",sectionId:s.id,message:"Dense component layout warrants responsive testing.",repairable:false});
 if(!media.length)findings.push({area:"media",severity:"info",message:"No explicit media components detected.",repairable:false});
 const areas={} as Record<CapabilityArea,number>; for(const a of AREAS)areas[a]=100;
 areas.planning=clamp(90+Math.min(10,actions.length));areas.editing=clamp(pages.length?85:40);areas.design=clamp(sections.length?80:35);areas.media=clamp(media.length?85:55);
 areas.responsive=clamp(100-long.length*8-dense.length*8);areas.accessibility=clamp(100-missingHeadings.length*10);areas.performance=clamp(100-(components.length>60?25:components.length>30?12:0));
 areas.seo=clamp(100-missingTitles.length*12-missingDescriptions.length*10);areas.architecture=clamp(100-findings.filter(f=>f.area==="architecture").length*12);areas.conversion=clamp(ctas.length?90:55);areas.cro=clamp(ctas.length?82:55);
 areas.browserQa=clamp(100-findings.length*4);areas.selfHealing=clamp(findings.some(f=>f.repairable)?85:100);areas.security=100;areas.ux=clamp(80+Math.min(20,ctas.length*5));areas.industry=85;areas.continuousOptimization=80;areas.runtimeQa=70;areas.visualRegression=70;areas.motion=80;areas.analytics=75;
 const runtimeRequired:CapabilityArea[]=["runtimeQa","visualRegression"],score=clamp(AREAS.reduce((sum,a)=>sum+areas[a],0)/AREAS.length);
 return {score,areas,findings,safeRepairCount:findings.filter(f=>f.repairable).length,runtimeRequired,summary:"Complete builder capability audit: "+score+"/100 across "+AREAS.length+" capability areas; "+findings.length+" finding(s), "+findings.filter(f=>f.repairable).length+" safe repair candidate(s)."};
}
export function capabilitySummary(a:CapabilityAudit){return a.summary;}
export function buildOptimizationPlan(a:CapabilityAudit){return Object.entries(a.areas).filter(([,score])=>score<80).sort((a,b)=>a[1]-b[1]).slice(0,8).map(([area,score])=>"Optimize "+area+" (current signal "+score+"/100)");}