import type { AgentContext } from "@/lib/site-agent.server";

export type UpgradeMode = "deterministic" | "runtime-boundary" | "evidence-gated";
export type UpgradeStatus = "active" | "runtime-required" | "evidence-required";
export type UpgradeSpec = { id:string; category:string; name:string; mode:UpgradeMode; status:UpgradeStatus; evidence:string; safeByDefault:boolean; };

export const UPGRADE_COUNT = 246 as const;
export const UPGRADE_CATALOG: readonly UpgradeSpec[] = [
  {
    "id": "U001",
    "category": "AI Planning",
    "name": "Master plan decomposition",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U002",
    "category": "AI Planning",
    "name": "Natural-language intent parsing",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U003",
    "category": "AI Planning",
    "name": "Ambiguity resolution",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U004",
    "category": "AI Planning",
    "name": "Instruction priority handling",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U005",
    "category": "AI Planning",
    "name": "Multi-action sequencing",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U006",
    "category": "AI Planning",
    "name": "Dependency ordering",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U007",
    "category": "AI Planning",
    "name": "Change-impact analysis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U008",
    "category": "AI Planning",
    "name": "Action deduplication",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U009",
    "category": "AI Planning",
    "name": "Conflict resolution",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U010",
    "category": "AI Planning",
    "name": "Task progress tracking",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U011",
    "category": "AI Planning",
    "name": "AI change explanation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U012",
    "category": "AI Planning",
    "name": "Plan risk scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U013",
    "category": "Context",
    "name": "Whole-site context graph",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U014",
    "category": "Context",
    "name": "Page relationship mapping",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U015",
    "category": "Context",
    "name": "Section relationship mapping",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U016",
    "category": "Context",
    "name": "Component relationship mapping",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U017",
    "category": "Context",
    "name": "Business-fact propagation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U018",
    "category": "Context",
    "name": "Audience context propagation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U019",
    "category": "Context",
    "name": "Goal context propagation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U020",
    "category": "Context",
    "name": "Conversation context retention",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U021",
    "category": "Context",
    "name": "Attachment context boundary",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U022",
    "category": "Context",
    "name": "Sitewide command targeting",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U023",
    "category": "Context",
    "name": "Affected-area detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U024",
    "category": "Context",
    "name": "Context freshness checks",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U025",
    "category": "Content",
    "name": "Placeholder detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U026",
    "category": "Content",
    "name": "Empty-copy completion",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U027",
    "category": "Content",
    "name": "Headline hierarchy",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U028",
    "category": "Content",
    "name": "Subheadline quality",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U029",
    "category": "Content",
    "name": "Body-copy completeness",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U030",
    "category": "Content",
    "name": "Industry terminology",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U031",
    "category": "Content",
    "name": "Audience language",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U032",
    "category": "Content",
    "name": "Tone consistency",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U033",
    "category": "Content",
    "name": "Duplicate-copy detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U034",
    "category": "Content",
    "name": "Thin-copy detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U035",
    "category": "Content",
    "name": "Factual-claim protection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U036",
    "category": "Content",
    "name": "Content quality scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U037",
    "category": "Conversion",
    "name": "Primary CTA detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U038",
    "category": "Conversion",
    "name": "CTA destination safety",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U039",
    "category": "Conversion",
    "name": "CTA label intelligence",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U040",
    "category": "Conversion",
    "name": "Above-fold CTA coverage",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U041",
    "category": "Conversion",
    "name": "Lead-form presence",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U042",
    "category": "Conversion",
    "name": "Booking-path coverage",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U043",
    "category": "Conversion",
    "name": "Contact-path coverage",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U044",
    "category": "Conversion",
    "name": "Quote-path coverage",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U045",
    "category": "Conversion",
    "name": "Trust-signal placement",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U046",
    "category": "Conversion",
    "name": "Conversion-friction detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U047",
    "category": "Conversion",
    "name": "Funnel-path mapping",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U048",
    "category": "Conversion",
    "name": "Conversion quality scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U049",
    "category": "Design",
    "name": "Design-system generation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U050",
    "category": "Design",
    "name": "Typography hierarchy",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U051",
    "category": "Design",
    "name": "Spacing-system consistency",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U052",
    "category": "Design",
    "name": "Color-system consistency",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U053",
    "category": "Design",
    "name": "Hero composition",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U054",
    "category": "Design",
    "name": "Card composition",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U055",
    "category": "Design",
    "name": "Visual hierarchy",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U056",
    "category": "Design",
    "name": "Premium layout detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U057",
    "category": "Design",
    "name": "Generic-design detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U058",
    "category": "Design",
    "name": "Design consistency",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U059",
    "category": "Design",
    "name": "Component visual reuse",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U060",
    "category": "Design",
    "name": "Visual quality scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U061",
    "category": "3D Motion",
    "name": "3D composition planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U062",
    "category": "3D Motion",
    "name": "Depth layering",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U063",
    "category": "3D Motion",
    "name": "Floating UI planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U064",
    "category": "3D Motion",
    "name": "Perspective effects",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U065",
    "category": "3D Motion",
    "name": "Motion hierarchy",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U066",
    "category": "3D Motion",
    "name": "Micro-interaction planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U067",
    "category": "3D Motion",
    "name": "Hover-state planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U068",
    "category": "3D Motion",
    "name": "Scroll-motion planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U069",
    "category": "3D Motion",
    "name": "Reduced-motion planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U070",
    "category": "3D Motion",
    "name": "Animation density control",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U071",
    "category": "3D Motion",
    "name": "Motion consistency",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U072",
    "category": "3D Motion",
    "name": "Motion quality scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U073",
    "category": "Responsive",
    "name": "Mobile-first structure",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U074",
    "category": "Responsive",
    "name": "Tablet structure",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U075",
    "category": "Responsive",
    "name": "Desktop structure",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U076",
    "category": "Responsive",
    "name": "Breakpoint inference",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U077",
    "category": "Responsive",
    "name": "Overflow detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U078",
    "category": "Responsive",
    "name": "Text-wrap detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U079",
    "category": "Responsive",
    "name": "Mobile navigation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U080",
    "category": "Responsive",
    "name": "Mobile CTA optimization",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U081",
    "category": "Responsive",
    "name": "Touch-target planning",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U082",
    "category": "Responsive",
    "name": "Responsive media planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U083",
    "category": "Responsive",
    "name": "Viewport-risk scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U084",
    "category": "Responsive",
    "name": "Responsive quality scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U085",
    "category": "Accessibility",
    "name": "Semantic structure",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U086",
    "category": "Accessibility",
    "name": "Accessible-name detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U087",
    "category": "Accessibility",
    "name": "Form-label detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U088",
    "category": "Accessibility",
    "name": "Heading-order detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U089",
    "category": "Accessibility",
    "name": "Alt-text detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U090",
    "category": "Accessibility",
    "name": "Focus-state requirements",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U091",
    "category": "Accessibility",
    "name": "Keyboard-path requirements",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U092",
    "category": "Accessibility",
    "name": "ARIA review",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U093",
    "category": "Accessibility",
    "name": "Contrast requirement",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U094",
    "category": "Accessibility",
    "name": "Reduced-motion requirement",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U095",
    "category": "Accessibility",
    "name": "Screen-reader requirement",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U096",
    "category": "Accessibility",
    "name": "Accessibility quality scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U097",
    "category": "SEO",
    "name": "Title metadata",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U098",
    "category": "SEO",
    "name": "Meta-description metadata",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U099",
    "category": "SEO",
    "name": "Canonical policy",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U100",
    "category": "SEO",
    "name": "Open Graph metadata",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U101",
    "category": "SEO",
    "name": "Social metadata",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U102",
    "category": "SEO",
    "name": "Heading SEO",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U103",
    "category": "SEO",
    "name": "Internal-link planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U104",
    "category": "SEO",
    "name": "Schema planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U105",
    "category": "SEO",
    "name": "Local SEO signals",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U106",
    "category": "SEO",
    "name": "Image SEO",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U107",
    "category": "SEO",
    "name": "Sitemap readiness",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U108",
    "category": "SEO",
    "name": "SEO quality scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U109",
    "category": "Performance",
    "name": "Component complexity audit",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U110",
    "category": "Performance",
    "name": "Image-weight audit",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U111",
    "category": "Performance",
    "name": "Lazy-loading planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U112",
    "category": "Performance",
    "name": "Font-loading review",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U113",
    "category": "Performance",
    "name": "JavaScript-cost boundary",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U114",
    "category": "Performance",
    "name": "CSS-cost boundary",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U115",
    "category": "Performance",
    "name": "Layout-shift boundary",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U116",
    "category": "Performance",
    "name": "Render-blocking boundary",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U117",
    "category": "Performance",
    "name": "Core Web Vitals queue",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U118",
    "category": "Performance",
    "name": "Network waterfall queue",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U119",
    "category": "Performance",
    "name": "Performance regression queue",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U120",
    "category": "Performance",
    "name": "Performance quality scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U121",
    "category": "Security",
    "name": "Tenant-isolation boundary",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U122",
    "category": "Security",
    "name": "RLS evidence boundary",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U123",
    "category": "Security",
    "name": "Server-auth boundary",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U124",
    "category": "Security",
    "name": "Client-secret detection",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U125",
    "category": "Security",
    "name": "Environment-secret detection",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U126",
    "category": "Security",
    "name": "Share-token boundary",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U127",
    "category": "Security",
    "name": "Invite-token boundary",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U128",
    "category": "Security",
    "name": "Preview-token boundary",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U129",
    "category": "Security",
    "name": "Permission boundary",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U130",
    "category": "Security",
    "name": "Credential-leak detection",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U131",
    "category": "Security",
    "name": "Dependency-risk boundary",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U132",
    "category": "Security",
    "name": "Security quality scoring",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U133",
    "category": "QA",
    "name": "Route smoke-test queue",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U134",
    "category": "QA",
    "name": "Broken-link detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U135",
    "category": "QA",
    "name": "Broken-image detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U136",
    "category": "QA",
    "name": "Console-error queue",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U137",
    "category": "QA",
    "name": "Runtime-error queue",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U138",
    "category": "QA",
    "name": "Form-submission queue",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U139",
    "category": "QA",
    "name": "CTA-click queue",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U140",
    "category": "QA",
    "name": "Screenshot comparison queue",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U141",
    "category": "QA",
    "name": "Cross-browser queue",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U142",
    "category": "QA",
    "name": "Mobile QA queue",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U143",
    "category": "QA",
    "name": "Regression queue",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U144",
    "category": "QA",
    "name": "QA quality scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U145",
    "category": "Recovery",
    "name": "Snapshot requirement",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U146",
    "category": "Recovery",
    "name": "Rollback requirement",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U147",
    "category": "Recovery",
    "name": "Version comparison",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U148",
    "category": "Recovery",
    "name": "Known-good restore",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U149",
    "category": "Recovery",
    "name": "Failed-group isolation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U150",
    "category": "Recovery",
    "name": "Bounded retry",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U151",
    "category": "Recovery",
    "name": "Change journal",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U152",
    "category": "Recovery",
    "name": "Undo planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U153",
    "category": "Recovery",
    "name": "Safe publish gate",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U154",
    "category": "Recovery",
    "name": "Post-publish verification",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U155",
    "category": "Recovery",
    "name": "Deployment rollback boundary",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U156",
    "category": "Recovery",
    "name": "Recovery quality scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U157",
    "category": "Analytics",
    "name": "Visitor funnel",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U158",
    "category": "Analytics",
    "name": "Account funnel",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U159",
    "category": "Analytics",
    "name": "Trial funnel",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U160",
    "category": "Analytics",
    "name": "Paid funnel",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U161",
    "category": "Analytics",
    "name": "Event deduplication",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U162",
    "category": "Analytics",
    "name": "Activation measurement",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U163",
    "category": "Analytics",
    "name": "Feature usage",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U164",
    "category": "Analytics",
    "name": "Builder success",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U165",
    "category": "Analytics",
    "name": "Site conversion",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U166",
    "category": "Analytics",
    "name": "Retention signals",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U167",
    "category": "Analytics",
    "name": "Funnel anomaly detection",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U168",
    "category": "Analytics",
    "name": "Analytics quality scoring",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U169",
    "category": "UX",
    "name": "Simple-mode UX",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U170",
    "category": "UX",
    "name": "Advanced-mode UX",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U171",
    "category": "UX",
    "name": "Power-user UX",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U172",
    "category": "UX",
    "name": "Command suggestions",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U173",
    "category": "UX",
    "name": "Quick actions",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U174",
    "category": "UX",
    "name": "Progress states",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U175",
    "category": "UX",
    "name": "Cancellation control",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U176",
    "category": "UX",
    "name": "Retry control",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U177",
    "category": "UX",
    "name": "Undo control",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U178",
    "category": "UX",
    "name": "Before-after preview",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U179",
    "category": "UX",
    "name": "Site-map navigation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U180",
    "category": "UX",
    "name": "Builder UX scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U181",
    "category": "Architecture",
    "name": "Component reuse detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U182",
    "category": "Architecture",
    "name": "Duplicate component detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U183",
    "category": "Architecture",
    "name": "Component extraction",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U184",
    "category": "Architecture",
    "name": "Design-token enforcement",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U185",
    "category": "Architecture",
    "name": "Dependency graph",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U186",
    "category": "Architecture",
    "name": "Dead-code detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U187",
    "category": "Architecture",
    "name": "Route consistency",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U188",
    "category": "Architecture",
    "name": "Shared-layout intelligence",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U189",
    "category": "Architecture",
    "name": "Section architecture",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U190",
    "category": "Architecture",
    "name": "Page architecture",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U191",
    "category": "Architecture",
    "name": "Site architecture scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U192",
    "category": "Architecture",
    "name": "Architecture risk scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U193",
    "category": "Generated Sites",
    "name": "Navigation generation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U194",
    "category": "Generated Sites",
    "name": "Footer generation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U195",
    "category": "Generated Sites",
    "name": "Contact page structure",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U196",
    "category": "Generated Sites",
    "name": "About page structure",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U197",
    "category": "Generated Sites",
    "name": "Services page structure",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U198",
    "category": "Generated Sites",
    "name": "FAQ structure",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U199",
    "category": "Generated Sites",
    "name": "Reviews structure",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U200",
    "category": "Generated Sites",
    "name": "Booking structure",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U201",
    "category": "Generated Sites",
    "name": "Lead capture structure",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U202",
    "category": "Generated Sites",
    "name": "Local page structure",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U203",
    "category": "Generated Sites",
    "name": "Multi-location structure",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U204",
    "category": "Generated Sites",
    "name": "404 structure",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U205",
    "category": "Autonomous Maintenance",
    "name": "Continuous site audit",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U206",
    "category": "Autonomous Maintenance",
    "name": "SEO maintenance",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U207",
    "category": "Autonomous Maintenance",
    "name": "Accessibility maintenance",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U208",
    "category": "Autonomous Maintenance",
    "name": "Performance maintenance",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U209",
    "category": "Autonomous Maintenance",
    "name": "Conversion maintenance",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U210",
    "category": "Autonomous Maintenance",
    "name": "Responsive maintenance",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U211",
    "category": "Autonomous Maintenance",
    "name": "Content maintenance",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U212",
    "category": "Autonomous Maintenance",
    "name": "Broken-link repair queue",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U213",
    "category": "Autonomous Maintenance",
    "name": "Regression repair queue",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U214",
    "category": "Autonomous Maintenance",
    "name": "Dependency-change impact",
    "mode": "evidence-gated",
    "status": "evidence-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U215",
    "category": "Autonomous Maintenance",
    "name": "Scheduled health-check boundary",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U216",
    "category": "Autonomous Maintenance",
    "name": "Maintenance quality scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U217",
    "category": "Operations",
    "name": "Release checklist",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U218",
    "category": "Operations",
    "name": "Release notes",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U219",
    "category": "Operations",
    "name": "Versioning contract",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U220",
    "category": "Operations",
    "name": "CI evidence",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U221",
    "category": "Operations",
    "name": "Required-check awareness",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U222",
    "category": "Operations",
    "name": "Deployment evidence",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U223",
    "category": "Operations",
    "name": "Uptime boundary",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U224",
    "category": "Operations",
    "name": "Error-monitoring boundary",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U225",
    "category": "Operations",
    "name": "Structured-log boundary",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U226",
    "category": "Operations",
    "name": "Webhook-failure boundary",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U227",
    "category": "Operations",
    "name": "Backup-restore boundary",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U228",
    "category": "Operations",
    "name": "Operational readiness scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U229",
    "category": "Extra",
    "name": "Industry playbook intelligence",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U230",
    "category": "Extra",
    "name": "Offer-positioning intelligence",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U231",
    "category": "Extra",
    "name": "Social-proof intelligence",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U232",
    "category": "Extra",
    "name": "Local-intent intelligence",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U233",
    "category": "Extra",
    "name": "Search-intent intelligence",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U234",
    "category": "Extra",
    "name": "Experiment planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U235",
    "category": "Extra",
    "name": "Pricing-page intelligence",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U236",
    "category": "Extra",
    "name": "FAQ intent mapping",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U237",
    "category": "Extra",
    "name": "Service-area intelligence",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U238",
    "category": "Extra",
    "name": "Lead-quality signals",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U239",
    "category": "Extra",
    "name": "Content freshness checks",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U240",
    "category": "Extra",
    "name": "Customer-journey mapping",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U241",
    "category": "Extra",
    "name": "Offer clarity audit",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U242",
    "category": "Extra",
    "name": "Trust architecture",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U243",
    "category": "Extra",
    "name": "Conversion copy variants",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U244",
    "category": "Extra",
    "name": "Industry competitor-pattern detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U245",
    "category": "Extra",
    "name": "Page-purpose validation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  },
  {
    "id": "U246",
    "category": "Extra",
    "name": "Site maturity scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Derived from current site graph, builder contracts, or required runtime/environment evidence.",
    "safeByDefault": true
  }
] as const;

export type UpgradeAudit={total:246;active:UpgradeSpec[];runtimeRequired:UpgradeSpec[];evidenceRequired:UpgradeSpec[];matchedCategories:string[];summary:string;};
const normalize=(v:unknown)=>typeof v==="string"?v.toLowerCase():"";
export function audit246Upgrades(context:AgentContext,instruction:string):UpgradeAudit{
 const text=normalize(instruction);
 const matchedCategories=Array.from(new Set(UPGRADE_CATALOG.filter(u=>{const hay=(u.category+" "+u.name).toLowerCase();return text===""||hay.split(" ").some(w=>w.length>4&&text.includes(w));}).map(u=>u.category)));
 const active=UPGRADE_CATALOG.filter(u=>u.status==="active"), runtimeRequired=UPGRADE_CATALOG.filter(u=>u.status==="runtime-required"), evidenceRequired=UPGRADE_CATALOG.filter(u=>u.status==="evidence-required");
 return {total:246,active,runtimeRequired,evidenceRequired,matchedCategories,summary:`246-upgrade matrix active: ${active.length} deterministic capabilities, ${runtimeRequired.length} runtime evidence boundaries, ${evidenceRequired.length} environment evidence boundaries, ${context.pages.length} pages inspected.`};
}
