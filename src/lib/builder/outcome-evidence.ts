import type { OutcomeMetric } from './improvement-history';

export type MetricEvidence = {
  metric: OutcomeMetric;
  source: 'analytics' | 'search-console' | 'crm' | 'manual';
  observedAt: string;
  sampleSize: number;
  baselineValue?: number;
  currentValue?: number;
};

export type EvidenceQuality = {
  credible: boolean;
  reasons: string[];
};

export function evaluateEvidenceQuality(evidence: MetricEvidence, minimumSampleSize = 20): EvidenceQuality {
  const reasons: string[] = [];
  if (!evidence.source) reasons.push('A data source is required.');
  if (!Number.isFinite(Date.parse(evidence.observedAt))) reasons.push('A valid observation date is required.');
  if (!Number.isFinite(evidence.sampleSize) || evidence.sampleSize < minimumSampleSize) reasons.push(`At least ${minimumSampleSize} observations are required.`);
  if (evidence.baselineValue !== undefined && !Number.isFinite(evidence.baselineValue)) reasons.push('The baseline value must be a finite number.');
  if (evidence.currentValue !== undefined && !Number.isFinite(evidence.currentValue)) reasons.push('The current value must be a finite number.');
  return { credible: reasons.length === 0, reasons };
}

export function canRecommendFromEvidence(evidence: MetricEvidence[]): boolean {
  return evidence.length > 0 && evidence.every((item) => evaluateEvidenceQuality(item).credible);
}
