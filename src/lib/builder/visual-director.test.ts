import { describe, expect, it } from 'vitest';
import { createVisualDirection } from './visual-director';

describe('createVisualDirection', () => {
  it('creates a quote-focused home-services direction with safe asset guidance', () => {
    const direction = createVisualDirection({ industry: 'home_services', conversionGoal: 'quotes', businessName: 'Northstar Roofing', location: 'Cleveland', hasRealPhotography: true });

    expect(direction.mood).toBe('refined');
    expect(direction.heroTreatment).toContain('quote');
    expect(direction.assetBriefs[0]?.canvaPrompt).toContain('Northstar Roofing in Cleveland');
    expect(direction.assetBriefs[0]?.canvaPrompt).toContain('avoid embedded text');
    expect(direction.assetBriefs.slice(1).every((asset) => asset.canvaPrompt.includes('no embedded text'))).toBe(true);
  });

  it('uses calm as the default health-and-wellness mood', () => {
    const direction = createVisualDirection({ industry: 'health_wellness', conversionGoal: 'bookings', businessName: 'Harbor Wellness', hasRealPhotography: false });

    expect(direction.mood).toBe('calm');
    expect(direction.mobileRule).toContain('booking');
  });
});
