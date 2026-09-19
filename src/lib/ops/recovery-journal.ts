export type RecoveryStatus="planned"|"snapshot"|"executing"|"failed"|"restored"|"verified";
export interface RecoveryEntry { operationId:string; status:RecoveryStatus; changedResources:string[]; reversible:boolean; restorePoint?:string; failure?:string; }
export function requiresRestorePoint(input:{destructive:boolean;tenantData:boolean;billing:boolean;production:boolean}){return input.destructive||input.tenantData||input.billing||input.production;}
export function advanceRecovery(entry:RecoveryEntry,next:RecoveryStatus):RecoveryEntry{
  const allowed:Record<RecoveryStatus,RecoveryStatus[]>={planned:["snapshot"],snapshot:["executing","failed"],executing:["failed","restored","verified"],failed:["restored"],restored:["verified"],verified:[]};
  if(!allowed[entry.status].includes(next)) throw new Error("invalid recovery transition");
  return {...entry,status:next};
}
