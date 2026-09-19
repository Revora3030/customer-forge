export interface FinalControl { id:string; category:string; name:string; mode:"deterministic"|"runtime"; blocking:boolean; }
export const FINAL_10_10_CONTROLS:FinalControl[]=[
  {
    "id": "F10-001",
    "category": "Browser",
    "name": "rendered DOM snapshot",
    "mode": "runtime",
    "blocking": false
  },
  {
    "id": "F10-002",
    "category": "Browser",
    "name": "viewport screenshot",
    "mode": "runtime",
    "blocking": false
  },
  {
    "id": "F10-003",
    "category": "Browser",
    "name": "navigation",
    "mode": "runtime",
    "blocking": false
  },
  {
    "id": "F10-004",
    "category": "Browser",
    "name": "console errors",
    "mode": "runtime",
    "blocking": false
  },
  {
    "id": "F10-005",
    "category": "Browser",
    "name": "network failures",
    "mode": "runtime",
    "blocking": false
  },
  {
    "id": "F10-006",
    "category": "Browser",
    "name": "form affordance",
    "mode": "runtime",
    "blocking": false
  },
  {
    "id": "F10-007",
    "category": "Browser",
    "name": "keyboard path",
    "mode": "runtime",
    "blocking": false
  },
  {
    "id": "F10-008",
    "category": "Browser",
    "name": "focus visibility",
    "mode": "runtime",
    "blocking": false
  },
  {
    "id": "F10-009",
    "category": "Browser",
    "name": "mobile touch targets",
    "mode": "runtime",
    "blocking": false
  },
  {
    "id": "F10-010",
    "category": "Browser",
    "name": "reduced motion",
    "mode": "runtime",
    "blocking": false
  },
  {
    "id": "F10-011",
    "category": "Browser",
    "name": "visual diff",
    "mode": "runtime",
    "blocking": false
  },
  {
    "id": "F10-012",
    "category": "Tenant",
    "name": "server tenant derivation",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-013",
    "category": "Tenant",
    "name": "membership check",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-014",
    "category": "Tenant",
    "name": "RLS coverage",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-015",
    "category": "Tenant",
    "name": "cross-tenant denial",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-016",
    "category": "Tenant",
    "name": "IDOR denial",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-017",
    "category": "Tenant",
    "name": "signed URL scope",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-018",
    "category": "Tenant",
    "name": "preview token expiry",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-019",
    "category": "Tenant",
    "name": "preview revocation",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-020",
    "category": "Tenant",
    "name": "cache key scope",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-021",
    "category": "Tenant",
    "name": "queue scope",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-022",
    "category": "Tenant",
    "name": "rate-limit scope",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-023",
    "category": "Auth",
    "name": "session boundary",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-024",
    "category": "Auth",
    "name": "logout invalidation",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-025",
    "category": "Auth",
    "name": "role boundary",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-026",
    "category": "Auth",
    "name": "invite expiry",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-027",
    "category": "Auth",
    "name": "invite revocation",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-028",
    "category": "Auth",
    "name": "password reset",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-029",
    "category": "Auth",
    "name": "email verification",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-030",
    "category": "Auth",
    "name": "reauthentication",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-031",
    "category": "Auth",
    "name": "admin boundary",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-032",
    "category": "Auth",
    "name": "anonymous boundary",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-033",
    "category": "Auth",
    "name": "service credential boundary",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-034",
    "category": "Billing",
    "name": "webhook signature",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-035",
    "category": "Billing",
    "name": "event idempotency",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-036",
    "category": "Billing",
    "name": "tenant resolution",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-037",
    "category": "Billing",
    "name": "subscription state",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-038",
    "category": "Billing",
    "name": "trial state",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-039",
    "category": "Billing",
    "name": "entitlement state",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-040",
    "category": "Billing",
    "name": "invoice linkage",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-041",
    "category": "Billing",
    "name": "refund boundary",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-042",
    "category": "Billing",
    "name": "payment mutation approval",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-043",
    "category": "Billing",
    "name": "billing audit trail",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-044",
    "category": "Billing",
    "name": "replay handling",
    "mode": "deterministic",
    "blocking": true
  },
  {
    "id": "F10-045",
    "category": "Builder",
    "name": "intent parsing",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-046",
    "category": "Builder",
    "name": "whole-site scope",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-047",
    "category": "Builder",
    "name": "site context",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-048",
    "category": "Builder",
    "name": "page context",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-049",
    "category": "Builder",
    "name": "section context",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-050",
    "category": "Builder",
    "name": "business fact protection",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-051",
    "category": "Builder",
    "name": "placeholder detection",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-052",
    "category": "Builder",
    "name": "duplicate action removal",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-053",
    "category": "Builder",
    "name": "bounded action count",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-054",
    "category": "Builder",
    "name": "safe destination selection",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-055",
    "category": "Builder",
    "name": "change explanation",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-056",
    "category": "Publication",
    "name": "route integrity",
    "mode": "runtime",
    "blocking": true
  },
  {
    "id": "F10-057",
    "category": "Publication",
    "name": "link integrity",
    "mode": "runtime",
    "blocking": true
  },
  {
    "id": "F10-058",
    "category": "Publication",
    "name": "CTA destination",
    "mode": "runtime",
    "blocking": true
  },
  {
    "id": "F10-059",
    "category": "Publication",
    "name": "form integrity",
    "mode": "runtime",
    "blocking": true
  },
  {
    "id": "F10-060",
    "category": "Publication",
    "name": "metadata completeness",
    "mode": "runtime",
    "blocking": true
  },
  {
    "id": "F10-061",
    "category": "Publication",
    "name": "schema presence",
    "mode": "runtime",
    "blocking": true
  },
  {
    "id": "F10-062",
    "category": "Publication",
    "name": "accessibility gate",
    "mode": "runtime",
    "blocking": true
  },
  {
    "id": "F10-063",
    "category": "Publication",
    "name": "mobile gate",
    "mode": "runtime",
    "blocking": true
  },
  {
    "id": "F10-064",
    "category": "Publication",
    "name": "performance gate",
    "mode": "runtime",
    "blocking": true
  },
  {
    "id": "F10-065",
    "category": "Publication",
    "name": "runtime gate",
    "mode": "runtime",
    "blocking": true
  },
  {
    "id": "F10-066",
    "category": "Publication",
    "name": "tenant-safety gate",
    "mode": "runtime",
    "blocking": true
  },
  {
    "id": "F10-067",
    "category": "SEO",
    "name": "title length",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-068",
    "category": "SEO",
    "name": "description length",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-069",
    "category": "SEO",
    "name": "canonical",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-070",
    "category": "SEO",
    "name": "robots",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-071",
    "category": "SEO",
    "name": "H1 uniqueness",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-072",
    "category": "SEO",
    "name": "image alt coverage",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-073",
    "category": "SEO",
    "name": "internal links",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-074",
    "category": "SEO",
    "name": "structured data",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-075",
    "category": "SEO",
    "name": "sitemap consistency",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-076",
    "category": "SEO",
    "name": "indexability",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-077",
    "category": "SEO",
    "name": "duplicate content",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-078",
    "category": "Performance",
    "name": "HTML budget",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-079",
    "category": "Performance",
    "name": "JS budget",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-080",
    "category": "Performance",
    "name": "CSS budget",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-081",
    "category": "Performance",
    "name": "request budget",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-082",
    "category": "Performance",
    "name": "image loading",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-083",
    "category": "Performance",
    "name": "font loading",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-084",
    "category": "Performance",
    "name": "LCP budget",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-085",
    "category": "Performance",
    "name": "CLS budget",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-086",
    "category": "Performance",
    "name": "INP budget",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-087",
    "category": "Performance",
    "name": "long-task detection",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-088",
    "category": "Performance",
    "name": "third-party budget",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-089",
    "category": "Accessibility",
    "name": "labels",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-090",
    "category": "Accessibility",
    "name": "heading order",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-091",
    "category": "Accessibility",
    "name": "contrast",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-092",
    "category": "Accessibility",
    "name": "keyboard",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-093",
    "category": "Accessibility",
    "name": "focus",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-094",
    "category": "Accessibility",
    "name": "target size",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-095",
    "category": "Accessibility",
    "name": "motion preference",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-096",
    "category": "Accessibility",
    "name": "language metadata",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-097",
    "category": "Accessibility",
    "name": "landmark structure",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-098",
    "category": "Accessibility",
    "name": "error messaging",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-099",
    "category": "Accessibility",
    "name": "form instructions",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-100",
    "category": "Operations",
    "name": "release risk",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-101",
    "category": "Operations",
    "name": "restore point",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-102",
    "category": "Operations",
    "name": "rollback plan",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-103",
    "category": "Operations",
    "name": "migration safety",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-104",
    "category": "Operations",
    "name": "backup evidence",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-105",
    "category": "Operations",
    "name": "restore evidence",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-106",
    "category": "Operations",
    "name": "incident log",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-107",
    "category": "Operations",
    "name": "health checks",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-108",
    "category": "Operations",
    "name": "telemetry redaction",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-109",
    "category": "Operations",
    "name": "request correlation",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-110",
    "category": "Operations",
    "name": "change audit",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-111",
    "category": "Browser",
    "name": "viewport overflow detection",
    "mode": "runtime",
    "blocking": false
  },
  {
    "id": "F10-112",
    "category": "Builder",
    "name": "instruction ambiguity detection",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-113",
    "category": "Builder",
    "name": "site-wide consistency pass",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-114",
    "category": "SEO",
    "name": "social metadata",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-115",
    "category": "Performance",
    "name": "lazy loading coverage",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-116",
    "category": "Performance",
    "name": "resource priority hints",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-117",
    "category": "Accessibility",
    "name": "semantic control names",
    "mode": "deterministic",
    "blocking": false
  },
  {
    "id": "F10-118",
    "category": "Operations",
    "name": "deployment health evidence",
    "mode": "runtime",
    "blocking": false
  },
  {
    "id": "F10-119",
    "category": "Operations",
    "name": "error budget signal",
    "mode": "runtime",
    "blocking": false
  },
  {
    "id": "F10-120",
    "category": "Publication",
    "name": "published-route smoke test",
    "mode": "runtime",
    "blocking": true
  }
];
export function auditFinal10Controls(){return {total:FINAL_10_10_CONTROLS.length,deterministic:FINAL_10_10_CONTROLS.filter(c=>c.mode==="deterministic").length,runtime:FINAL_10_10_CONTROLS.filter(c=>c.mode==="runtime").length,blocking:FINAL_10_10_CONTROLS.filter(c=>c.blocking).length,categories:[...new Set(FINAL_10_10_CONTROLS.map(c=>c.category))]};}
