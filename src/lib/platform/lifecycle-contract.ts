export type LifecycleStage="visitor"|"account"|"trial"|"active_trial"|"paid"|"churned";
export type LifecycleEvent="visitor"|"signup_completed"|"trial_started"|"trial_active"|"subscription_active"|"subscription_canceled"|"subscription_reactivated";
export interface CanonicalLifecycleEvent { event:LifecycleEvent; entityId:string; occurredAt:string; idempotencyKey:string; source:"server"|"stripe"|"browser"; }
const transitions:Record<LifecycleStage,LifecycleStage[]>={visitor:["account"],account:["trial"],trial:["active_trial","paid","churned"],active_trial:["paid","churned"],paid:["churned"],churned:["trial","paid"]};
export function isLifecycleTransitionAllowed(from:LifecycleStage,to:LifecycleStage){return transitions[from].includes(to);}
export function canonicalizeLifecycleEvent(input:CanonicalLifecycleEvent):CanonicalLifecycleEvent{return {...input,entityId:input.entityId.trim(),idempotencyKey:input.idempotencyKey.trim(),occurredAt:new Date(input.occurredAt).toISOString()};}
