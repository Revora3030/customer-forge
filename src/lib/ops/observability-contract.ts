export interface TelemetryEvent { name:string; tenantId?:string; actorId?:string; requestId?:string; properties:Record<string,string|number|boolean|null>; }
const forbiddenKeys=/(password|secret|token|api[_-]?key|authorization|cookie|service[_-]?role|private[_-]?key)/i;
export function sanitizeTelemetry(event:TelemetryEvent):TelemetryEvent{return {...event,properties:Object.fromEntries(Object.entries(event.properties).filter(([key])=>!forbiddenKeys.test(key)))};}
export function telemetryIsSafe(event:TelemetryEvent){return Object.keys(event.properties).every(key=>!forbiddenKeys.test(key));}
