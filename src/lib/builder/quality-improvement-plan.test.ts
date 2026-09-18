import { describe, expect, it } from 'vitest';
import { assessLaunchQuality } from './launch-quality-gate';
import { planQualityImprovements } from './quality-improvement-plan';

describe('planQualityImprovements', () => {
  it('turns the highest-priority findings into preview-first, reversible AI plans', () => {
    const report = assessLaunchQuality({ conversion: 20, messaging: 30, content: 90, visual_design: 85, mobile: 90, accessibility: 90, seo: 90, trust: 90, performance: 90, publishing: 90 });
    const plans = planQualityImprovements(report);

    expect(plans).toHaveLength(2);
    const firstPlan = plans[0]!;
    expect(firstPlan).toMatchObject({ id: 'quality-conversion', scope: 'hero', requiresPreview: true, reversible: true });
    expect(firstPlan.instruction).toContain('Do not publish automatically');
  });

  it('limits plans defensively', () => {
    const report = assessLaunchQuality({});

    expect(planQualityImprovements(report, 0)).toHaveLength(1);
    expect(planQualityImprovements(report, 999)).toHaveLength(5);
  });
});
