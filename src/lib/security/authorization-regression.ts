export type Actor="anonymous"|"tenant_user"|"tenant_admin"|"platform_admin";
export type Action="read"|"create"|"update"|"delete"|"execute";
export interface AuthorizationRule{resource:string;action:Action;allowed:Actor[];tenantScoped:boolean;}
export interface AuthorizationCase{actor:Actor;resource:string;action:Action;sameTenant:boolean;expected:"allow"|"deny";}
export function buildAuthorizationMatrix(rules:AuthorizationRule[]):AuthorizationCase[]{
 const cases:AuthorizationCase[]=[];
 for(const rule of rules)for(const actor of ["anonymous","tenant_user","tenant_admin","platform_admin"] as Actor[])for(const sameTenant of [true,false]){
   const roleAllowed=rule.allowed.includes(actor);
   const expected=roleAllowed&&(!rule.tenantScoped||sameTenant||actor==="platform_admin")?"allow":"deny";
   cases.push({actor,resource:rule.resource,action:rule.action,sameTenant,expected});
 }
 return cases;
}
export function hasCrossTenantNegativeCoverage(cases:AuthorizationCase[]){return cases.some(c=>!c.sameTenant&&c.expected==="deny");}
