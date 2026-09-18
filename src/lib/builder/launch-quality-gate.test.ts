import { describe, expect, it } from 'vitest';
import { assessLaunchQuality } from './launch-quality-gate';

describe('assessLaunchQuality', () => {
  it('creates an excellent, action-free report for a complete launch', () => {
    const report = assessLaunchQuality({
      conversion: 100, messaging: 100, content: 100, visual_design: 100, mobile: 100,
      accessibility: 100, seo: 100, trust: 100, performance: 100, publishing: 100,
    });

    expect(report).toMatchObject({ score: 100, grade: 'excellent', findings: [], nextAction: null });
    expect(report.passed).toHaveLength(10);
  });

  it('prioritizes a weak high-weight conversion path over less important gaps', () => {
    const report = assessLaunchQuality({
      conversion: 25, messaging: 70, content: 70, visual_design: 70, mobile: 70,
      accessibility: 70, seo: 70, trust: 70, performance: 70, publishing: 70,
    });

    expect(report.grade).toBe('needs_work');
    expect(report.nextAction).toMatchObject({ dimension: 'conversion', priority: 'critical' });
  });

  it('bounds invalid input instead of producing an invalid score', () => {
    const report = assessLaunchQuality({ conversion: 120, messaging: -5 });

    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.findings.find((finding) => finding.dimension === 'messaging')?.score).toBe(0);
  });
});
