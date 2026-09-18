export type LaunchQualityDimension =
  | 'conversion'
  | 'messaging'
  | 'content'
  | 'visual_design'
  | 'mobile'
  | 'accessibility'
  | 'seo'
  | 'trust'
  | 'performance'
  | 'publishing';

export type LaunchQualityInput = Partial<Record<LaunchQualityDimension, number>>;

export type LaunchQualityFinding = {
  dimension: LaunchQualityDimension;
  score: number;
  weight: number;
  priority: 'critical' | 'high' | 'medium';
  title: string;
  recommendation: string;
};

export type LaunchQualityReport = {
  score: number;
  grade: 'not_ready' | 'needs_work' | 'launch_ready' | 'excellent';
  passed: LaunchQualityDimension[];
  findings: LaunchQualityFinding[];
  nextAction: LaunchQualityFinding | null;
};

const dimensions: Array<{
  key: LaunchQualityDimension;
  weight: number;
  title: string;
  recommendation: string;
}> = [
  { key: 'conversion', weight: 16, title: 'Clarify the primary conversion path', recommendation: 'Give the hero one clear customer action and repeat that action at the natural decision points.' },
  { key: 'messaging', weight: 13, title: 'Make the value proposition more specific', recommendation: 'Name the audience, their desired outcome, and the reason to choose this business in the first screen.' },
  { key: 'content', weight: 10, title: 'Complete the decision-making content', recommendation: 'Add service detail, process, FAQs, and practical proof so visitors can decide without leaving the site.' },
  { key: 'visual_design', weight: 10, title: 'Strengthen visual hierarchy', recommendation: 'Use one premium visual direction, intentional spacing, readable type scale, and imagery that supports the offer.' },
  { key: 'mobile', weight: 11, title: 'Improve the mobile experience', recommendation: 'Prioritize the primary action, simplify dense sections, and verify comfortable tap targets at phone widths.' },
  { key: 'accessibility', weight: 9, title: 'Resolve accessibility basics', recommendation: 'Check color contrast, heading order, meaningful labels, keyboard access, and reduced-motion behavior.' },
  { key: 'seo', weight: 9, title: 'Finish search foundations', recommendation: 'Write a unique page title and description, use one clear H1, and include service and location intent naturally.' },
  { key: 'trust', weight: 8, title: 'Add credible trust signals', recommendation: 'Add genuine reviews, credentials, guarantees, project examples, or process transparency near conversion points.' },
  { key: 'performance', weight: 7, title: 'Reduce page weight', recommendation: 'Use appropriately sized images, defer nonessential media, and avoid effects that delay the first useful render.' },
  { key: 'publishing', weight: 7, title: 'Complete the launch checklist', recommendation: 'Confirm the domain, contact paths, analytics, privacy links, and production publishing state before launch.' },
];

function bounded(value: number | undefined): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? Number(value) : 0));
}

function priorityFor(score: number): LaunchQualityFinding['priority'] {
  if (score < 40) return 'critical';
  if (score < 65) return 'high';
  return 'medium';
}

function gradeFor(score: number): LaunchQualityReport['grade'] {
  if (score < 55) return 'not_ready';
  if (score < 75) return 'needs_work';
  if (score < 90) return 'launch_ready';
  return 'excellent';
}

export function assessLaunchQuality(input: LaunchQualityInput): LaunchQualityReport {
  const findings = dimensions
    .map((dimension) => {
      const score = bounded(input[dimension.key]);
      return { ...dimension, score, priority: priorityFor(score), dimension: dimension.key };
    })
    .filter((finding) => finding.score < 80)
    .sort((a, b) => (a.score - b.score) || (b.weight - a.weight));

  const score = Math.round(dimensions.reduce((total, dimension) => total + bounded(input[dimension.key]) * dimension.weight, 0) / 100);
  const passed = dimensions.filter((dimension) => bounded(input[dimension.key]) >= 80).map((dimension) => dimension.key);

  return {
    score,
    grade: gradeFor(score),
    passed,
    findings,
    nextAction: findings[0] ?? null,
  };
}
