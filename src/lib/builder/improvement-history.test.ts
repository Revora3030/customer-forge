import { describe, expect, it } from 'vitest';
import { calculateMetricChange, prioritizeRecommendations, summarizeOutcomeChange } from './improvement-history';

describe('outcome-based improvement history', () => {
  it('calculates metric changes safely', () => {
    expect(calculateMetricChange(10, 15)).toBe(50);
    expect(calculateMetricChange(0, 15)).toBeNull();
  });

  it('explains outcome movement from snapshots', () => {
    expect(summarizeOutcomeChange('qualifiedLeads', { capturedAt: '2026-01-01', values: { qualifiedLeads: 20 } }, { capturedAt: '2026-02-01', values: { qualifiedLeads: 15 } })).toContain('decreased by 25.0%');
  });

  it('prioritizes confidence before recommendation volume', () => {
    const result = prioritizeRecommendations([{ id: 'low', title: 'Low', rationale: '', metric: 'organicClicks', direction: 'increase', confidence: 'low', evidence: ['a', 'b'] }, { id: 'high', title: 'High', rationale: '', metric: 'organicClicks', direction: 'increase', confidence: 'high', evidence: ['a'] }]);
    expect(result[0].id).toBe('high');
  });
});
