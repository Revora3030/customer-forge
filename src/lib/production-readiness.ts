export type ReadinessEvidence = {
  tenantIsolation: "verified" | "partial" | "unverified";
  authenticationBoundary: "verified" | "partial" | "unverified";
  generatedSiteVerification: "verified" | "partial" | "unverified";
  rollback: "verified" | "partial" | "unverified";
  observability: "verified" | "partial" | "unverified";
  backupRestore: "verified" | "partial" | "unverified";
  activationMeasurement: "verified" | "partial" | "unverified";
};

export type ReadinessResult = {
  ready: boolean;
  verified: number;
  partial: number;
  unverified: number;
  blockers: string[];
};

const labels: Record<keyof ReadinessEvidence, string> = {
  tenantIsolation: "tenant isolation",
  authenticationBoundary: "authentication boundary",
  generatedSiteVerification: "generated-site verification",
  rollback: "rollback",
  observability: "observability",
  backupRestore: "backup/restore",
  activationMeasurement: "activation measurement",
};

export function evaluateProductionReadiness(evidence: ReadinessEvidence): ReadinessResult {
  const entries = Object.entries(evidence) as [keyof ReadinessEvidence, ReadinessEvidence[keyof ReadinessEvidence]][];
  const verified = entries.filter(([, value]) => value === "verified").length;
  const partial = entries.filter(([, value]) => value === "partial").length;
  const unverified = entries.filter(([, value]) => value === "unverified").length;
  const blockers = entries.filter(([, value]) => value !== "verified").map(([key, value]) => labels[key] + ": " + value);
  return { ready: blockers.length === 0, verified, partial, unverified, blockers };
}
