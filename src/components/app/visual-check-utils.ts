import type { VisualReport } from "@/lib/builder/visual";

export function repairBriefFrom(report: VisualReport): string {
  const lines = report.findings
    .map((f) => `- ${f.page ? `[${f.page}] ` : ""}${f.detail} ${f.fix}`.trim())
    .join("\n");
  return [
    "The real-browser quality check measured these problems on the rendered site.",
    "Repair every one through the site's composition, keeping the design direction, all owner words, facts, pictures, forms and links. Do not remove anything.",
    lines,
  ].join("\n");
}
