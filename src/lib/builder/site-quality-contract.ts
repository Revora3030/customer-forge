export interface SiteQualitySignals { routeIntegrity:boolean; meaningfulContent:boolean; placeholderFree:boolean; conversionPath:boolean; metadata:boolean; accessibility:boolean; mobileLayout:boolean; performance:boolean; secureResources:boolean; tenantSafety:boolean; runtimeClean:boolean; }
export interface SiteQualityResult { score:number; passed:boolean; failed:string[]; blocking:string[]; }
const labels:Array<[keyof SiteQualitySignals,string]> = [
  ["routeIntegrity","route integrity"],["meaningfulContent","meaningful content"],["placeholderFree","placeholder-free content"],["conversionPath","conversion path"],["metadata","metadata"],["accessibility","accessibility"],["mobileLayout","mobile layout"],["performance","performance"],["secureResources","secure resources"],["tenantSafety","tenant safety"],["runtimeClean","runtime cleanliness"]
];
export function evaluateSiteQuality(signals:SiteQualitySignals):SiteQualityResult {
  const failed=labels.filter(([key])=>!signals[key]).map(([,label])=>label);
  const score=Math.round(((labels.length-failed.length)/labels.length)*100);
  const blocking=failed.filter(label=>["route integrity","conversion path","tenant safety","secure resources"].includes(label));
  return {score,passed:failed.length===0,failed,blocking};
}
