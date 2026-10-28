import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOVABLE_CONVERSATION_MODELS } from "@/lib/ai/lovable-models";
import { AI_TEAM_ROLES } from "./ai-team-public";

const config = readFileSync("src/lib/ai/config.ts", "utf8");
const isImage = (id: string) => id.includes("gpt-image");

describe("public AI team", () => {
  it("lists only models that exist: text models in the chat roster, picture models in the image configuration", () => {
    for (const role of AI_TEAM_ROLES) {
      expect(role.models.length).toBeGreaterThan(0);
      for (const id of role.models) {
        if (isImage(id)) expect(config).toContain(`"${id}"`);
        else expect(LOVABLE_CONVERSATION_MODELS as readonly string[]).toContain(id);
      }
    }
  });

  it("has unique roles and no promise, ranking or result claim in its wording", () => {
    expect(new Set(AI_TEAM_ROLES.map((role) => role.id)).size).toBe(AI_TEAM_ROLES.length);
    for (const role of AI_TEAM_ROLES) {
      expect(`${role.role} ${role.job}`).not.toMatch(/\b(guarantee|best|#1|always|never fails|10x|2x|\d+%)\b/i);
    }
  });
});
