import type { SiteBrief } from "@/lib/site-brief";

export const FIRST_BUILD_REQUEST_LIMIT = 1200;

export function parseFirstBuildInstruction(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error("Describe the website you want in text.");
  const text = value.trim();
  if (text.length > FIRST_BUILD_REQUEST_LIMIT) throw new Error("Keep your website brief within 1,200 characters.");
  return text || null;
}

export function withFirstBuildInstruction(brief: SiteBrief, instruction: string | null): SiteBrief {
  return instruction
    ? { ...brief, factAnswers: { ...brief.factAnswers, build_request: instruction } }
    : brief;
}