import { describe, expect, it } from 'vitest';
import { createVisualDirection } from './visual-director';

describe('createVisualDirection', () => {
  it('creates a quote-focused home-services direction with safe asset guidance', () => {
    const direction = createVisualDirection({ industry: 'home_services', conversionGoal: 'quotes', businessName: 'Northstar Roofing', location: 'Cleveland', hasRealPhotography: true });
    const [hero, proof, service] = direction.assetBriefs;

    expect(direction.mood).toBe('refined');
    expect(direction.heroTreatment).toContain('quote');
    expect(hero?.canvaPrompt).toContain('Northstar Roofing in Cleveland');
    expect(hero?.canvaPrompt).toContain('avoid embedded text');
    expect(proof?.canvaPrompt).toContain('no logos or text baked into the image');
    expect(service?.canvaPrompt).toContain('no embedded text');
  });

  it('uses calm as the default health-and-wellness mood', () => {
    const direction = createVisualDirection({ industry: 'health_wellness', conversionGoal: 'bookings', businessName: 'Harbor Wellness', hasRealPhotography: false });

    expect(direction.mood).toBe('calm');
    expect(direction.mobileRule).toContain('booking');
  });
});
