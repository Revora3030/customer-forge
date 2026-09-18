import { describe, expect, it } from 'vitest';
import { canPublish, createPrepublishChecklist, type PublishEvidence } from './prepublish-checklist';

const complete: PublishEvidence = { customDomainConnected: true, contactRouteVerified: true, primaryCtaVerified: true, mobileReviewed: true, accessibilityReviewed: true, analyticsConfigured: true, privacyPagePublished: true, termsPagePublished: true, seoMetadataComplete: true };

describe('prepublish checklist', () => {
  it('blocks publish until all required evidence is present', () => {
    expect(canPublish(complete)).toBe(true);
    expect(canPublish({ ...complete, contactRouteVerified: false })).toBe(false);
  });

  it('identifies incomplete evidence with clear remediation guidance', () => {
    const check = createPrepublishChecklist({ ...complete, mobileReviewed: false }).find((item) => item.id === 'mobileReviewed');
    expect(check).toMatchObject({ complete: false, required: true });
    expect(check?.guidance).toContain('phone');
  });
});
