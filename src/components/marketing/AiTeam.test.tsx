import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiTeam } from "@/components/marketing/AiTeam";
import { AI_TEAM_ROLES, teamModelName } from "@/lib/ai-team-public";

describe("AiTeam", () => {
  const html = renderToStaticMarkup(<AiTeam />);

  it("shows every role with the models that lead it", () => {
    for (const role of AI_TEAM_ROLES) {
      expect(html).toContain(role.role);
      for (const model of role.models) expect(html).toContain(teamModelName(model));
    }
  });

  it("names models readably", () => {
    expect(teamModelName("openai/gpt-6.1-sol")).toBe("GPT 6.1 Sol");
    expect(teamModelName("anthropic/claude-fable-5-1")).toBe("Claude Fable 5.1");
    expect(teamModelName("openai/gpt-image-2.5-sunburst")).toBe("GPT Image 2.5 Sunburst");
  });

  it("says models are chosen per task and that the owner reviews everything", () => {
    expect(html).toContain("picked automatically");
    expect(html).toContain("you review everything before it goes live");
  });
});
