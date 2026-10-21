import { FIRST_BUILD_REQUEST_LIMIT } from "@/lib/builder/first-build-request";

export type WebsiteRequest = {
  businessName: string;
  industry: string;
  services: string;
  serviceArea: string;
  brandPreferences: string;
  referenceUrl: string;
};

export function websiteRequestInstruction(input: WebsiteRequest): string {
  if (!input.businessName.trim() || !input.services.trim()) throw new Error("Add your business name and services.");
  let reference = "";
  if (input.referenceUrl.trim()) {
    let url: URL;
    try { url = new URL(input.referenceUrl.trim()); } catch { throw new Error("Use a complete https:// reference website address."); }
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use a complete https:// reference website address.");
    reference = url.href;
  }
  const instruction = [
    "Build my complete website using this owner-supplied brief:",
    `Business: ${input.businessName.trim()}`,
    input.industry.trim() ? `Industry: ${input.industry.trim()}` : "",
    `Services: ${input.services.trim()}`,
    input.serviceArea.trim() ? `Service area: ${input.serviceArea.trim()}` : "",
    input.brandPreferences.trim() ? `Brand preferences: ${input.brandPreferences.trim()}` : "",
    reference ? `Design reference only (not business facts): ${reference}` : "",
  ].filter(Boolean).join("\n");
  if (instruction.length > FIRST_BUILD_REQUEST_LIMIT) throw new Error("Shorten your brief to fit within 1,200 characters.");
  return instruction;
}