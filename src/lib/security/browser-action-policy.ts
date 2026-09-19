export type BrowserAction="navigate"|"click"|"type"|"submit"|"upload"|"download"|"delete"|"publish";
export interface BrowserActionDecision{allowed:boolean;requiresApproval:boolean;reason:string;}
const mutating=new Set<BrowserAction>(["submit","upload","download","delete","publish"]);
export function evaluateBrowserAction(action:BrowserAction,input:{production:boolean;customerData:boolean;payment:boolean;explicitApproval:boolean}):BrowserActionDecision{
 if(action==="delete"||action==="publish")return {allowed:input.explicitApproval,requiresApproval:true,reason:"destructive or publication action requires explicit approval"};
 if(input.payment)return {allowed:false,requiresApproval:true,reason:"payment actions are outside autonomous browser QA"};
 if(input.customerData&&mutating.has(action))return {allowed:input.explicitApproval,requiresApproval:true,reason:"customer-data mutation requires explicit approval"};
 if(input.production&&mutating.has(action))return {allowed:input.explicitApproval,requiresApproval:true,reason:"production mutation requires explicit approval"};
 return {allowed:true,requiresApproval:false,reason:"read-only or non-sensitive browser action"};
}
