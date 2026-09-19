export interface PublicationEvidence {routes:boolean;links:boolean;forms:boolean;placeholders:boolean;metadata:boolean;a11y:boolean;mobile:boolean;performance:boolean;runtime:boolean;tenantSafety:boolean;}
export function canPublish(e:PublicationEvidence){const blockers=Object.entries(e).filter(([,value])=>!value).map(([key])=>key);return {allowed:blockers.length===0,blockers};}
