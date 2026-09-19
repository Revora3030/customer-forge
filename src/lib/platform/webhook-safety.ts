export interface WebhookSafetyDecision { accepted:boolean; reasons:string[]; idempotent:boolean; }
export function evaluateWebhookSafety(input:{signatureValid:boolean;eventId:string;alreadyProcessed:boolean;customerTenantResolved:boolean;eventType:string}):WebhookSafetyDecision{
  const reasons:string[]=[];
  if(!input.signatureValid) reasons.push("invalid signature");
  if(!input.eventId.trim()) reasons.push("missing event id");
  if(!input.customerTenantResolved) reasons.push("tenant could not be resolved");
  if(!input.eventType.trim()) reasons.push("missing event type");
  return {accepted:reasons.length===0,reasons,idempotent:input.alreadyProcessed||Boolean(input.eventId.trim())};
}
