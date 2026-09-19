export interface PromptSecurityResult { normalized:string; suspicious:boolean; reasons:string[]; allowed:boolean; }
const patterns:Array<[RegExp,string]>=[
  [/ignore (all|any|previous|prior) instructions/i,"instruction override attempt"],
  [/reveal|expose|print|dump.{0,20}(secret|token|key|password)/i,"secret extraction attempt"],
  [/system prompt|developer message|hidden instructions/i,"hidden-instruction extraction attempt"],
  [/disable (security|auth|rls|billing|validation)/i,"security control bypass attempt"],
  [/cross[- ]tenant|another tenant|other user's data/i,"cross-tenant request"]
];
export function inspectBuilderPrompt(prompt:string):PromptSecurityResult {
  const normalized=prompt.trim().replace(/\s+/g," ");
  const reasons=patterns.filter(([pattern])=>pattern.test(normalized)).map(([,reason])=>reason);
  return {normalized,suspicious:reasons.length>0,reasons,allowed:!reasons.some(r=>r.includes("secret")||r.includes("security")||r.includes("cross-tenant"))};
}
