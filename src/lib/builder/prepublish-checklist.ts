export type PublishEvidence = {
  customDomainConnected: boolean;
  contactRouteVerified: boolean;
  primaryCtaVerified: boolean;
  mobileReviewed: boolean;
  accessibilityReviewed: boolean;
  analyticsConfigured: boolean;
  privacyPagePublished: boolean;
  termsPagePublished: boolean;
  seoMetadataComplete: boolean;
};

export type PublishCheck = {
  id: keyof PublishEvidence;
  label: string;
  required: boolean;
  complete: boolean;
  guidance: string;
};

const guidance: Record<keyof PublishEvidence, string> = {
  customDomainConnected: 'Connect and verify the intended production domain.',
  contactRouteVerified: 'Submit a real contact request and confirm the business receives it.',
  primaryCtaVerified: 'Test the primary CTA from desktop and mobile views.',
  mobileReviewed: 'Review the published flow on a real phone-sized viewport.',
  accessibilityReviewed: 'Check keyboard access, contrast, labels, headings, and reduced motion.',
  analyticsConfigured: 'Confirm the analytics property receives a real page-view event.',
  privacyPagePublished: 'Publish an accessible privacy-policy page.',
  termsPagePublished: 'Publish accessible terms or equivalent customer-facing legal terms.',
  seoMetadataComplete: 'Confirm every indexed page has a unique title, description, and clear H1.',
};

export function createPrepublishChecklist(evidence: PublishEvidence): PublishCheck[] {
  return (Object.keys(guidance) as Array<keyof PublishEvidence>).map((id) => ({ id, label: id.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase()), required: true, complete: evidence[id], guidance: guidance[id] }));
}

export function canPublish(evidence: PublishEvidence): boolean {
  return createPrepublishChecklist(evidence).every((check) => !check.required || check.complete);
}
