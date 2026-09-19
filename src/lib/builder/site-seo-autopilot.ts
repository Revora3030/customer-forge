import type { AgentAction, PageSeoPatch } from "@/lib/site-agent";

export function compileSeoAutopilot(
  pages: Array<{ id: string; title: string; slug: string; seo_title?: string | null; seo_description?: string | null }>,
  businessName: string,
  industry: string,
  city: string | null,
  cap: number,
): AgentAction[] {
  const actions: AgentAction[] = [];
  for (const page of pages) {
    if (actions.length >= cap) break;
    const title = page.title.trim() || "Home";
    const location = city ? " in " + city : "";
    const seo: PageSeoPatch = {
      seo_title: page.seo_title?.trim() || (title + " | " + businessName).slice(0, 60),
      seo_description: page.seo_description?.trim() || (title + " services by " + businessName + ", a " + industry + " business" + location + ". Learn more, view services and get in touch.").slice(0, 160),
      og_title: page.seo_title?.trim() || (title + " | " + businessName).slice(0, 60),
      og_description: page.seo_description?.trim() || (businessName + ": " + title + location + ".").slice(0, 160),
    };
    actions.push({ type: "set_page", pageId: page.id, patch: seo });
  }
  return actions;
}
