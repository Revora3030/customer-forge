/**
 * Optional privacy-minimal OTLP trace export for Revora AI provider attempts.
 * Worker-compatible OTLP/HTTP JSON; never exports prompts, completions,
 * user/workspace IDs, credentials or raw provider errors.
 */
import type { AiEvent } from "./telemetry.server";
type Attr={key:string;value:{stringValue?:string;intValue?:string;boolValue?:boolean}};
const env=(n:string)=>typeof process.env[n]==="string"?process.env[n]!.trim():"";
function label(v:unknown,max=100){return String(v??"").replace(/[\r\n\t]/g," ").replace(/\b(?:sk-(?:live|test|proj)-|sk_live_|sk_test_|whsec_|AIza|Bearer\s+)\S+/gi,"[redacted]").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[email]").slice(0,max);}
function randomHex(n:number){const b=new Uint8Array(n);crypto.getRandomValues(b);return [...b].map(v=>v.toString(16).padStart(2,"0")).join("");}
function traceIdOf(id:string){const value=id.replace(/-/g,"").toLowerCase();return /^[0-9a-f]{32}$/.test(value)&&!/^0+$/.test(value)?value:randomHex(16);}
function secureUrl(raw:string):URL|null{try{const u=new URL(raw),loopback=["localhost","127.0.0.1","::1"].includes(u.hostname);if(u.protocol!=="https:"&&!(u.protocol==="http:"&&loopback))return null;if(u.username||u.password)return null;return u;}catch{return null;}}
function otlpUrl():string|null{const explicit=env("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"),base=env("OTEL_EXPORTER_OTLP_ENDPOINT");if(!explicit&&!base)return null;const u=secureUrl(explicit||base);if(!u)return null;if(!explicit&&!u.pathname.replace(/\/$/,"").endsWith("/v1/traces"))u.pathname=`${u.pathname.replace(/\/$/,"")}/v1/traces`;return u.toString();}
function langfuse():{url:string;authorization:string}|null{const pub=env("LANGFUSE_PUBLIC_KEY"),secret=env("LANGFUSE_SECRET_KEY");if(!pub||!secret)return null;const u=secureUrl(env("LANGFUSE_BASE_URL")||"https://cloud.langfuse.com");if(!u)return null;u.pathname=`${u.pathname.replace(/\/$/,"")}/api/public/otel/v1/traces`;return {url:u.toString(),authorization:`Basic ${btoa(`${pub}:${secret}`)}`};}
function attr(key:string,value:string|number|boolean):Attr{if(typeof value==="number")return {key,value:{intValue:String(Math.max(0,Math.round(value)))}};if(typeof value==="boolean")return {key,value:{boolValue:value}};return {key,value:{stringValue:label(value)}};}
export function buildOtlpTracePayload(event:AiEvent,now=Date.now()){
 const end=BigInt(Math.max(0,Math.trunc(now*1e6))).toString(),start=BigInt(Math.max(0,Math.trunc((now-Math.max(0,event.latencyMs))*1e6))).toString();
 const attributes:Attr[]=[attr("gen_ai.provider.name",event.provider),attr("gen_ai.request.model",event.model),attr("gen_ai.operation.name",event.task),attr("gen_ai.usage.input_tokens",event.inputTokens??0),attr("gen_ai.usage.output_tokens",event.outputTokens??0),attr("revora.fallback_used",event.fallbackUsed),attr("revora.tool_calls",event.toolCalls),attr("revora.request.ok",event.ok)];
 if(event.errorCategory)attributes.push(attr("error.type",event.errorCategory));
 return {resourceSpans:[{resource:{attributes:[attr("service.name","revora-growth-systems"),attr("deployment.environment.name",env("NODE_ENV")||"unknown")]},scopeSpans:[{scope:{name:"revora.ai.telemetry",version:"1.0.0"},spans:[{traceId:traceIdOf(event.requestId),spanId:randomHex(8),name:"gen_ai.provider.call",kind:3,startTimeUnixNano:start,endTimeUnixNano:end,attributes,status:{code:event.ok?1:2,...(event.errorCategory?{message:label(event.errorCategory,60)}:{})}}]}]}]};
}
export function getAiObservabilityExportStatus(){const otlpConfigured=otlpUrl()!==null,langfuseConfigured=langfuse()!==null;return {otlpConfigured,langfuseConfigured,anyDestinationConfigured:otlpConfigured||langfuseConfigured,promptsAndCompletionsIncluded:false as const,tenantAndUserIdsIncluded:false as const,ingestionVerified:false as const};}
export async function exportAiTelemetry(event:AiEvent):Promise<{attempted:number;delivered:number}>{
 const body=JSON.stringify(buildOtlpTracePayload(event)),targets:{name:string;url:string;headers:Record<string,string>}[]=[];
 const endpoint=otlpUrl();if(endpoint)targets.push({name:"otlp",url:endpoint,headers:{"content-type":"application/json",...(env("OTEL_EXPORTER_OTLP_AUTHORIZATION")?{authorization:env("OTEL_EXPORTER_OTLP_AUTHORIZATION")}:{})}});
 const lf=langfuse();if(lf)targets.push({name:"langfuse",url:lf.url,headers:{"content-type":"application/json",authorization:lf.authorization,"x-langfuse-ingestion-version":"4"}});
 if(!targets.length)return {attempted:0,delivered:0};
 const results=await Promise.all(targets.map(async t=>{try{const response=await fetch(t.url,{method:"POST",headers:t.headers,body,signal:AbortSignal.timeout(1500)});if(!response.ok){console.warn("[revora-ai-observability] export rejected",{destination:t.name,status:response.status});return false;}return true;}catch{console.warn("[revora-ai-observability] export failed",{destination:t.name});return false;}}));
 return {attempted:targets.length,delivered:results.filter(Boolean).length};
}
