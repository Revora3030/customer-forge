import { describe, expect, it } from 'vitest';
import { evaluateRecommendation, splitRecommendations } from './actionable-recommendations';

const base = { id: 'headline', title: 'Clarify headline', rationale: 'Visitors are not progressing.', metric: 'qualifiedLeads' as const, direction: 'increase' as const, confidence: 'high' as const, evidence: ['lead trend'] };
const credible = { metric: 'qualifiedLeads' as const, source: 'crm' as const, observedAt: '2026-09-01T00:00:00.000Z', sampleSize: 30 };

describe('actionable recommendations', () => {
  it('holds recommendations without linked evidence', () => {
    expect(evaluateRecommendation({ ...base, linkedEvidence: [] }).actionable).toBe(false);
  });

  it('allows a recommendation with credible linked evidence', () => {
    expect(evaluateRecommendation({ ...base, linkedEvidence: [credible] }).actionable).toBe(true);
  });

  it('separates actionable and held recommendations', () => {
    const result = splitRecommendations([{ ...base, id: 'ready', linkedEvidence: [credible] }, { ...base, id: 'held', linkedEvidence: [{ ...credible, sampleSize: 2 }] }]);
    expect(result.actionable).toHaveLength(1);
    expect(result.held).toHaveLength(1);
  });
});
