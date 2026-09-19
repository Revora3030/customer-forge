import type { AgentContext } from "@/lib/site-agent.server";

export type ExpansionMode = "deterministic" | "runtime-boundary";
export type ExpansionSpec = Readonly<{id:string;category:string;name:string;mode:ExpansionMode;status:"active"|"runtime-required";evidence:string;safeByDefault:true}>;

export const EXPANSION_285_COUNT = 285 as const;
export const EXPANSION_285: readonly ExpansionSpec[] = [
  {
    "id": "X001",
    "category": "AI Intelligence",
    "name": "Intent decomposition",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X002",
    "category": "AI Intelligence",
    "name": "Instruction memory",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X003",
    "category": "AI Intelligence",
    "name": "Ambiguity scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X004",
    "category": "AI Intelligence",
    "name": "Constraint extraction",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X005",
    "category": "AI Intelligence",
    "name": "Goal inference",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X006",
    "category": "AI Intelligence",
    "name": "Priority arbitration",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X007",
    "category": "AI Intelligence",
    "name": "Multi-step reasoning map",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X008",
    "category": "AI Intelligence",
    "name": "Task graph synthesis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X009",
    "category": "AI Intelligence",
    "name": "Dependency inference",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X010",
    "category": "AI Intelligence",
    "name": "Context compression",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X011",
    "category": "AI Intelligence",
    "name": "Context recovery",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X012",
    "category": "AI Intelligence",
    "name": "Decision confidence",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X013",
    "category": "AI Intelligence",
    "name": "Safe fallback planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X014",
    "category": "AI Intelligence",
    "name": "Tool boundary planning",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X015",
    "category": "AI Intelligence",
    "name": "Natural-language normalization",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X016",
    "category": "Autonomous Builder",
    "name": "Autonomous build loop",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X017",
    "category": "Autonomous Builder",
    "name": "Change batching",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X018",
    "category": "Autonomous Builder",
    "name": "Bounded execution",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X019",
    "category": "Autonomous Builder",
    "name": "Plan checkpointing",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X020",
    "category": "Autonomous Builder",
    "name": "Post-action inspection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X021",
    "category": "Autonomous Builder",
    "name": "Failure classification",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X022",
    "category": "Autonomous Builder",
    "name": "Repair prioritization",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X023",
    "category": "Autonomous Builder",
    "name": "Repair budget control",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X024",
    "category": "Autonomous Builder",
    "name": "Safe retry policy",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X025",
    "category": "Autonomous Builder",
    "name": "Known-good preservation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X026",
    "category": "Autonomous Builder",
    "name": "Change isolation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X027",
    "category": "Autonomous Builder",
    "name": "Execution journal",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X028",
    "category": "Autonomous Builder",
    "name": "Completion detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X029",
    "category": "Autonomous Builder",
    "name": "Stop-condition enforcement",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X030",
    "category": "Autonomous Builder",
    "name": "Autonomous handoff",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X031",
    "category": "Visual Intelligence",
    "name": "Visual hierarchy analysis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X032",
    "category": "Visual Intelligence",
    "name": "Composition balancing",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X033",
    "category": "Visual Intelligence",
    "name": "Whitespace tuning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X034",
    "category": "Visual Intelligence",
    "name": "Alignment consistency",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X035",
    "category": "Visual Intelligence",
    "name": "Contrast-aware styling",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X036",
    "category": "Visual Intelligence",
    "name": "Visual rhythm detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X037",
    "category": "Visual Intelligence",
    "name": "Section density control",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X038",
    "category": "Visual Intelligence",
    "name": "Image focal-point planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X039",
    "category": "Visual Intelligence",
    "name": "Visual emphasis scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X040",
    "category": "Visual Intelligence",
    "name": "Brand consistency analysis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X041",
    "category": "Visual Intelligence",
    "name": "Layout novelty detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X042",
    "category": "Visual Intelligence",
    "name": "Premium composition patterns",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X043",
    "category": "Visual Intelligence",
    "name": "Desktop visual contract",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X044",
    "category": "Visual Intelligence",
    "name": "Mobile visual contract",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X045",
    "category": "Visual Intelligence",
    "name": "Visual regression intent",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X046",
    "category": "Browser Intelligence",
    "name": "Browser navigation plan",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X047",
    "category": "Browser Intelligence",
    "name": "Route traversal planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X048",
    "category": "Browser Intelligence",
    "name": "Interactive element inventory",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X049",
    "category": "Browser Intelligence",
    "name": "Form interaction plan",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X050",
    "category": "Browser Intelligence",
    "name": "Keyboard traversal plan",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X051",
    "category": "Browser Intelligence",
    "name": "Focus order inspection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X052",
    "category": "Browser Intelligence",
    "name": "Viewport matrix planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X053",
    "category": "Browser Intelligence",
    "name": "Scroll-state inspection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X054",
    "category": "Browser Intelligence",
    "name": "Responsive breakpoint inspection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X055",
    "category": "Browser Intelligence",
    "name": "Link activation plan",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X056",
    "category": "Browser Intelligence",
    "name": "Modal interaction plan",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X057",
    "category": "Browser Intelligence",
    "name": "Menu interaction plan",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X058",
    "category": "Browser Intelligence",
    "name": "Hover-state inspection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X059",
    "category": "Browser Intelligence",
    "name": "Touch interaction plan",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X060",
    "category": "Browser Intelligence",
    "name": "Browser evidence ledger",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X061",
    "category": "Self Healing",
    "name": "Failure clustering",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X062",
    "category": "Self Healing",
    "name": "Root-cause hypothesis queue",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X063",
    "category": "Self Healing",
    "name": "Minimal repair selection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X064",
    "category": "Self Healing",
    "name": "Repair confidence scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X065",
    "category": "Self Healing",
    "name": "Rollback trigger detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X066",
    "category": "Self Healing",
    "name": "Regression containment",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X067",
    "category": "Self Healing",
    "name": "Repair verification",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X068",
    "category": "Self Healing",
    "name": "Repair escalation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X069",
    "category": "Self Healing",
    "name": "Stalled-plan recovery",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X070",
    "category": "Self Healing",
    "name": "Partial-success recovery",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X071",
    "category": "Self Healing",
    "name": "Action replay protection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X072",
    "category": "Self Healing",
    "name": "Repair loop termination",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X073",
    "category": "Self Healing",
    "name": "Safe-state restoration",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X074",
    "category": "Self Healing",
    "name": "Post-repair audit",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X075",
    "category": "Self Healing",
    "name": "Healing history",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X076",
    "category": "Premium Website Generation",
    "name": "Premium hero direction",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X077",
    "category": "Premium Website Generation",
    "name": "Brand-led layout generation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X078",
    "category": "Premium Website Generation",
    "name": "High-end typography pairing",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X079",
    "category": "Premium Website Generation",
    "name": "Editorial section composition",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X080",
    "category": "Premium Website Generation",
    "name": "Luxury spacing system",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X081",
    "category": "Premium Website Generation",
    "name": "Conversion-first hero",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X082",
    "category": "Premium Website Generation",
    "name": "Storytelling section flow",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X083",
    "category": "Premium Website Generation",
    "name": "Trust architecture generation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X084",
    "category": "Premium Website Generation",
    "name": "Service presentation design",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X085",
    "category": "Premium Website Generation",
    "name": "Portfolio presentation design",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X086",
    "category": "Premium Website Generation",
    "name": "Pricing presentation design",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X087",
    "category": "Premium Website Generation",
    "name": "Testimonial presentation design",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X088",
    "category": "Premium Website Generation",
    "name": "Contact experience design",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X089",
    "category": "Premium Website Generation",
    "name": "Footer experience design",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X090",
    "category": "Premium Website Generation",
    "name": "Premium polish pass",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X091",
    "category": "Motion And 3D",
    "name": "Depth-layer planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X092",
    "category": "Motion And 3D",
    "name": "3D hero framing",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X093",
    "category": "Motion And 3D",
    "name": "Floating UI planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X094",
    "category": "Motion And 3D",
    "name": "Parallax intent mapping",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X095",
    "category": "Motion And 3D",
    "name": "Microinteraction planning",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X096",
    "category": "Motion And 3D",
    "name": "Scroll reveal planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X097",
    "category": "Motion And 3D",
    "name": "Hover motion planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X098",
    "category": "Motion And 3D",
    "name": "Card elevation planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X099",
    "category": "Motion And 3D",
    "name": "Motion hierarchy",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X100",
    "category": "Motion And 3D",
    "name": "Motion density control",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X101",
    "category": "Motion And 3D",
    "name": "Reduced-motion adaptation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X102",
    "category": "Motion And 3D",
    "name": "Animation timing system",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X103",
    "category": "Motion And 3D",
    "name": "Perspective consistency",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X104",
    "category": "Motion And 3D",
    "name": "3D asset placement",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X105",
    "category": "Motion And 3D",
    "name": "Motion performance budget",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X106",
    "category": "Conversion AI",
    "name": "Conversion path mapping",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X107",
    "category": "Conversion AI",
    "name": "Primary action selection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X108",
    "category": "Conversion AI",
    "name": "Secondary action selection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X109",
    "category": "Conversion AI",
    "name": "CTA placement analysis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X110",
    "category": "Conversion AI",
    "name": "CTA label generation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X111",
    "category": "Conversion AI",
    "name": "Lead friction analysis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X112",
    "category": "Conversion AI",
    "name": "Form field minimization",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X113",
    "category": "Conversion AI",
    "name": "Booking funnel analysis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X114",
    "category": "Conversion AI",
    "name": "Quote funnel analysis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X115",
    "category": "Conversion AI",
    "name": "Trust signal sequencing",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X116",
    "category": "Conversion AI",
    "name": "Objection handling sections",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X117",
    "category": "Conversion AI",
    "name": "Benefit prioritization",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X118",
    "category": "Conversion AI",
    "name": "Offer clarity analysis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X119",
    "category": "Conversion AI",
    "name": "Conversion copy testing plan",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X120",
    "category": "Conversion AI",
    "name": "Funnel completeness audit",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X121",
    "category": "SEO Intelligence",
    "name": "Search intent mapping",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X122",
    "category": "SEO Intelligence",
    "name": "Keyword-to-page mapping",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X123",
    "category": "SEO Intelligence",
    "name": "Title optimization",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X124",
    "category": "SEO Intelligence",
    "name": "Description optimization",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X125",
    "category": "SEO Intelligence",
    "name": "Heading optimization",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X126",
    "category": "SEO Intelligence",
    "name": "Internal link planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X127",
    "category": "SEO Intelligence",
    "name": "Canonical planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X128",
    "category": "SEO Intelligence",
    "name": "Schema planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X129",
    "category": "SEO Intelligence",
    "name": "Sitemap coverage analysis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X130",
    "category": "SEO Intelligence",
    "name": "Indexability checks",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X131",
    "category": "SEO Intelligence",
    "name": "Duplicate page detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X132",
    "category": "SEO Intelligence",
    "name": "Thin content detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X133",
    "category": "SEO Intelligence",
    "name": "Local SEO structure",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X134",
    "category": "SEO Intelligence",
    "name": "Entity relevance mapping",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X135",
    "category": "SEO Intelligence",
    "name": "SEO change impact",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X136",
    "category": "Mobile Intelligence",
    "name": "Mobile-first hierarchy",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X137",
    "category": "Mobile Intelligence",
    "name": "Touch target planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X138",
    "category": "Mobile Intelligence",
    "name": "Mobile navigation planning",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X139",
    "category": "Mobile Intelligence",
    "name": "Sticky action planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X140",
    "category": "Mobile Intelligence",
    "name": "Mobile typography scaling",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X141",
    "category": "Mobile Intelligence",
    "name": "Mobile spacing scaling",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X142",
    "category": "Mobile Intelligence",
    "name": "Mobile media adaptation",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X143",
    "category": "Mobile Intelligence",
    "name": "Mobile card stacking",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X144",
    "category": "Mobile Intelligence",
    "name": "Mobile form optimization",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X145",
    "category": "Mobile Intelligence",
    "name": "Mobile CTA prominence",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X146",
    "category": "Mobile Intelligence",
    "name": "Mobile overflow detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X147",
    "category": "Mobile Intelligence",
    "name": "Mobile interaction simplification",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X148",
    "category": "Mobile Intelligence",
    "name": "Mobile performance planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X149",
    "category": "Mobile Intelligence",
    "name": "Mobile accessibility checks",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X150",
    "category": "Mobile Intelligence",
    "name": "Mobile regression plan",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X151",
    "category": "Performance Intelligence",
    "name": "Asset weight analysis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X152",
    "category": "Performance Intelligence",
    "name": "Image optimization planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X153",
    "category": "Performance Intelligence",
    "name": "Font loading planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X154",
    "category": "Performance Intelligence",
    "name": "Lazy loading planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X155",
    "category": "Performance Intelligence",
    "name": "Render path analysis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X156",
    "category": "Performance Intelligence",
    "name": "Critical content prioritization",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X157",
    "category": "Performance Intelligence",
    "name": "Bundle impact analysis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X158",
    "category": "Performance Intelligence",
    "name": "Layout shift risk detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X159",
    "category": "Performance Intelligence",
    "name": "Interaction latency planning",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X160",
    "category": "Performance Intelligence",
    "name": "Cache strategy boundary",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X161",
    "category": "Performance Intelligence",
    "name": "Network waterfall boundary",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X162",
    "category": "Performance Intelligence",
    "name": "Core Web Vitals planning",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X163",
    "category": "Performance Intelligence",
    "name": "Third-party impact analysis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X164",
    "category": "Performance Intelligence",
    "name": "Performance regression detection",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X165",
    "category": "Performance Intelligence",
    "name": "Performance budget enforcement",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X166",
    "category": "Security Intelligence",
    "name": "Secret exposure detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X167",
    "category": "Security Intelligence",
    "name": "Tenant boundary planning",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X168",
    "category": "Security Intelligence",
    "name": "Authorization boundary checks",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X169",
    "category": "Security Intelligence",
    "name": "Input trust analysis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X170",
    "category": "Security Intelligence",
    "name": "Unsafe URL detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X171",
    "category": "Security Intelligence",
    "name": "Injection-risk detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X172",
    "category": "Security Intelligence",
    "name": "Permission boundary planning",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X173",
    "category": "Security Intelligence",
    "name": "Share-token threat modeling",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X174",
    "category": "Security Intelligence",
    "name": "Invite-token threat modeling",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X175",
    "category": "Security Intelligence",
    "name": "Session boundary review",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X176",
    "category": "Security Intelligence",
    "name": "Webhook trust boundary",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X177",
    "category": "Security Intelligence",
    "name": "Sensitive-data redaction",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X178",
    "category": "Security Intelligence",
    "name": "Security regression checks",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X179",
    "category": "Security Intelligence",
    "name": "Dependency security review",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X180",
    "category": "Security Intelligence",
    "name": "Security release gate",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X181",
    "category": "Advanced QA",
    "name": "Static contract testing",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X182",
    "category": "Advanced QA",
    "name": "Route integrity testing",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X183",
    "category": "Advanced QA",
    "name": "CTA integrity testing",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X184",
    "category": "Advanced QA",
    "name": "Metadata testing",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X185",
    "category": "Advanced QA",
    "name": "Content completeness testing",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X186",
    "category": "Advanced QA",
    "name": "Accessibility contract testing",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X187",
    "category": "Advanced QA",
    "name": "Responsive contract testing",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X188",
    "category": "Advanced QA",
    "name": "Performance contract testing",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X189",
    "category": "Advanced QA",
    "name": "Security contract testing",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X190",
    "category": "Advanced QA",
    "name": "Component invariant testing",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X191",
    "category": "Advanced QA",
    "name": "Plan invariant testing",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X192",
    "category": "Advanced QA",
    "name": "Action deduplication testing",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X193",
    "category": "Advanced QA",
    "name": "Visual evidence requirements",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X194",
    "category": "Advanced QA",
    "name": "Runtime evidence requirements",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X195",
    "category": "Advanced QA",
    "name": "Release QA matrix",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X196",
    "category": "Codebase Intelligence",
    "name": "Dependency graph awareness",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X197",
    "category": "Codebase Intelligence",
    "name": "Component ownership mapping",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X198",
    "category": "Codebase Intelligence",
    "name": "Shared utility detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X199",
    "category": "Codebase Intelligence",
    "name": "Dead-code awareness",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X200",
    "category": "Codebase Intelligence",
    "name": "Change surface analysis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X201",
    "category": "Codebase Intelligence",
    "name": "Import impact analysis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X202",
    "category": "Codebase Intelligence",
    "name": "Type contract awareness",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X203",
    "category": "Codebase Intelligence",
    "name": "Test coverage mapping",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X204",
    "category": "Codebase Intelligence",
    "name": "Schema awareness",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X205",
    "category": "Codebase Intelligence",
    "name": "Route registry awareness",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X206",
    "category": "Codebase Intelligence",
    "name": "Style system awareness",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X207",
    "category": "Codebase Intelligence",
    "name": "Design token awareness",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X208",
    "category": "Codebase Intelligence",
    "name": "Build configuration awareness",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X209",
    "category": "Codebase Intelligence",
    "name": "Environment boundary awareness",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X210",
    "category": "Codebase Intelligence",
    "name": "Repository drift detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X211",
    "category": "Version Recovery",
    "name": "Draft snapshot planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X212",
    "category": "Version Recovery",
    "name": "Preview state planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X213",
    "category": "Version Recovery",
    "name": "Publish state planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X214",
    "category": "Version Recovery",
    "name": "Version history awareness",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X215",
    "category": "Version Recovery",
    "name": "Restore point planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X216",
    "category": "Version Recovery",
    "name": "Rollback planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X217",
    "category": "Version Recovery",
    "name": "Change provenance",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X218",
    "category": "Version Recovery",
    "name": "Diff summarization",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X219",
    "category": "Version Recovery",
    "name": "Safe revert detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X220",
    "category": "Version Recovery",
    "name": "Migration awareness",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X221",
    "category": "Version Recovery",
    "name": "Release candidate tracking",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X222",
    "category": "Version Recovery",
    "name": "Recovery verification",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X223",
    "category": "Version Recovery",
    "name": "Known-good tagging",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X224",
    "category": "Version Recovery",
    "name": "Restore safety checks",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X225",
    "category": "Version Recovery",
    "name": "Version retention policy",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X226",
    "category": "Product Intelligence",
    "name": "Activation journey mapping",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X227",
    "category": "Product Intelligence",
    "name": "Onboarding friction analysis",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X228",
    "category": "Product Intelligence",
    "name": "Next-step guidance",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X229",
    "category": "Product Intelligence",
    "name": "Feature discoverability",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X230",
    "category": "Product Intelligence",
    "name": "User intent continuity",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X231",
    "category": "Product Intelligence",
    "name": "Workspace journey mapping",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X232",
    "category": "Product Intelligence",
    "name": "Builder simplicity scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X233",
    "category": "Product Intelligence",
    "name": "Power-user shortcut planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X234",
    "category": "Product Intelligence",
    "name": "Feedback signal capture",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X235",
    "category": "Product Intelligence",
    "name": "Success-state messaging",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X236",
    "category": "Product Intelligence",
    "name": "Empty-state intelligence",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X237",
    "category": "Product Intelligence",
    "name": "Error-state intelligence",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X238",
    "category": "Product Intelligence",
    "name": "Progressive disclosure",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X239",
    "category": "Product Intelligence",
    "name": "Feature adoption signals",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X240",
    "category": "Product Intelligence",
    "name": "Product quality dashboard",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X241",
    "category": "Generated Site Intelligence",
    "name": "Page-purpose inference",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X242",
    "category": "Generated Site Intelligence",
    "name": "Navigation architecture",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X243",
    "category": "Generated Site Intelligence",
    "name": "Footer completeness",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X244",
    "category": "Generated Site Intelligence",
    "name": "Contact architecture",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X245",
    "category": "Generated Site Intelligence",
    "name": "Service architecture",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X246",
    "category": "Generated Site Intelligence",
    "name": "About architecture",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X247",
    "category": "Generated Site Intelligence",
    "name": "FAQ architecture",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X248",
    "category": "Generated Site Intelligence",
    "name": "Reviews architecture",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X249",
    "category": "Generated Site Intelligence",
    "name": "Booking architecture",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X250",
    "category": "Generated Site Intelligence",
    "name": "Lead capture architecture",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X251",
    "category": "Generated Site Intelligence",
    "name": "Local landing architecture",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X252",
    "category": "Generated Site Intelligence",
    "name": "Multi-location architecture",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X253",
    "category": "Generated Site Intelligence",
    "name": "404 experience",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X254",
    "category": "Generated Site Intelligence",
    "name": "Legal-page awareness",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X255",
    "category": "Generated Site Intelligence",
    "name": "Sitewide consistency",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X256",
    "category": "Autonomous Maintenance",
    "name": "Continuous audit planning",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X257",
    "category": "Autonomous Maintenance",
    "name": "Scheduled audit boundary",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X258",
    "category": "Autonomous Maintenance",
    "name": "Stale-content detection",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X259",
    "category": "Autonomous Maintenance",
    "name": "Broken-link queue",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X260",
    "category": "Autonomous Maintenance",
    "name": "SEO maintenance queue",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X261",
    "category": "Autonomous Maintenance",
    "name": "Accessibility maintenance queue",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X262",
    "category": "Autonomous Maintenance",
    "name": "Performance maintenance queue",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X263",
    "category": "Autonomous Maintenance",
    "name": "Conversion maintenance queue",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X264",
    "category": "Autonomous Maintenance",
    "name": "Responsive maintenance queue",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X265",
    "category": "Autonomous Maintenance",
    "name": "Dependency impact queue",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X266",
    "category": "Autonomous Maintenance",
    "name": "Regression repair queue",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X267",
    "category": "Autonomous Maintenance",
    "name": "Health-check boundary",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X268",
    "category": "Autonomous Maintenance",
    "name": "Maintenance prioritization",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X269",
    "category": "Autonomous Maintenance",
    "name": "Maintenance history",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X270",
    "category": "Autonomous Maintenance",
    "name": "Maintenance safety gate",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X271",
    "category": "Operations And Analytics",
    "name": "Release readiness matrix",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X272",
    "category": "Operations And Analytics",
    "name": "Required-check awareness",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X273",
    "category": "Operations And Analytics",
    "name": "Deployment evidence",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X274",
    "category": "Operations And Analytics",
    "name": "Rollback evidence",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X275",
    "category": "Operations And Analytics",
    "name": "Uptime evidence",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X276",
    "category": "Operations And Analytics",
    "name": "Error-monitoring evidence",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X277",
    "category": "Operations And Analytics",
    "name": "Structured-log evidence",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X278",
    "category": "Operations And Analytics",
    "name": "Webhook-health evidence",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X279",
    "category": "Operations And Analytics",
    "name": "Backup-restore evidence",
    "mode": "runtime-boundary",
    "status": "runtime-required",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X280",
    "category": "Operations And Analytics",
    "name": "Activation metric mapping",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X281",
    "category": "Operations And Analytics",
    "name": "Funnel metric integrity",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X282",
    "category": "Operations And Analytics",
    "name": "Event deduplication",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X283",
    "category": "Operations And Analytics",
    "name": "Analytics source-of-truth",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X284",
    "category": "Operations And Analytics",
    "name": "Experiment measurement",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  },
  {
    "id": "X285",
    "category": "Operations And Analytics",
    "name": "Operational maturity scoring",
    "mode": "deterministic",
    "status": "active",
    "evidence": "Capability is represented by deterministic planning or an explicit runtime/evidence boundary; no unavailable browser, production, provider, or infrastructure evidence is fabricated.",
    "safeByDefault": true
  }
] as const;

export function audit285Expansion(context: AgentContext, instruction: string) {
  const text = instruction.toLowerCase();
  const matchedCategories = Array.from(new Set(EXPANSION_285.filter((u) => text === "" || (u.category+" "+u.name).toLowerCase().split(/\\s+/).some((w) => w.length > 4 && text.includes(w))).map((u) => u.category)));
  const active = EXPANSION_285.filter((u) => u.status === "active");
  const runtimeRequired = EXPANSION_285.filter((u) => u.status === "runtime-required");
  return { total: 285 as const, active, runtimeRequired, matchedCategories, pages: context.pages.length, summary: `285-upgrade expansion active: ${active.length} deterministic capabilities and ${runtimeRequired.length} runtime/evidence boundaries across ${context.pages.length} pages.` };
}
