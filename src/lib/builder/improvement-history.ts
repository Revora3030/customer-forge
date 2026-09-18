export type OutcomeMetric = 'conversionRate' | 'qualifiedLeads' | 'contactSubmissions' | 'organicClicks' | 'engagementRate';

export type OutcomeSnapshot = {
  capturedAt: string;
  values: Partial<Record<OutcomeMetric, number>>;
};

export type ImprovementRecommendation = {
  id: string;
  title: string;
  rationale: string;
  metric: OutcomeMetric;
  direction: 'increase' | 'decrease';
  confidence: 'low' | 'medium' | 'high';
  evidence: string[];
};

export function calculateMetricChange(before: number, after: number): number | null {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === 0) return null;
  return ((after - before) / Math.abs(before)) * 100;
}

export function summarizeOutcomeChange(metric: OutcomeMetric, baseline: OutcomeSnapshot, current: OutcomeSnapshot): string {
  const before = baseline.values[metric];
  const after = current.values[metric];
  if (before === undefined || after === undefined) return 'Insufficient data to assess this outcome.';
  const change = calculateMetricChange(before, after);
  if (change === null) return 'A baseline above zero is required to assess percentage change.';
  return `${metric} ${change >= 0 ? 'increased' : 'decreased'} by ${Math.abs(change).toFixed(1)}% since the baseline.`;
}

export function prioritizeRecommendations(recommendations: ImprovementRecommendation[]): ImprovementRecommendation[] {
  const confidenceScore = { high: 3, medium: 2, low: 1 };
  return [...recommendations].sort((a, b) => confidenceScore[b.confidence] - confidenceScore[a.confidence] || b.evidence.length - a.evidence.length);
}
