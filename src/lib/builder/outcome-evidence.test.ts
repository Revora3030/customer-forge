import { describe, expect, it } from 'vitest';
import { canRecommendFromEvidence, evaluateEvidenceQuality } from './outcome-evidence';

describe('outcome evidence quality', () => {
  const valid = { metric: 'qualifiedLeads' as const, source: 'crm' as const, observedAt: '2026-09-01T00:00:00.000Z', sampleSize: 24, baselineValue: 10, currentValue: 12 };

  it('accepts evidence with a source, valid date, and sufficient sample', () => {
    expect(evaluateEvidenceQuality(valid)).toEqual({ credible: true, reasons: [] });
  });

  it('flags insufficient or malformed evidence', () => {
    const result = evaluateEvidenceQuality({ ...valid, observedAt: 'not-a-date', sampleSize: 4 });
    expect(result.credible).toBe(false);
    expect(result.reasons).toHaveLength(2);
  });

  it('requires all linked evidence to be credible before recommendations are enabled', () => {
    expect(canRecommendFromEvidence([valid])).toBe(true);
    expect(canRecommendFromEvidence([{ ...valid, sampleSize: 1 }])).toBe(false);
  });
});
