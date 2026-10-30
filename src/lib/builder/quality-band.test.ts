import { describe, expect, it } from "vitest";
import {
  CATEGORY_WEIGHTS,
  TEAM_CATEGORIES,
  qualityBand,
  teamScorecard,
  weakestTeamArea,
  type QualityCategory,
  type QualityIssue,
} from "./quality";

const blocker: QualityIssue = { key: "invalid_phone", severity: "blocker", detail: "x", fix: "y" };

describe("RQS band — hard gates before the average", () => {
  it("a blocker is 'blocked' whatever the score", () => {
    expect(qualityBand({ score: 99, blockers: [blocker], productionReady: false })).toBe("blocked");
  });

  it("maps the score to the bands", () => {
    const at = (score: number) => qualityBand({ score, blockers: [], productionReady: true });
    expect(at(40)).toBe("reject");
    expect(at(69)).toBe("reject");
    expect(at(75)).toBe("needs_correction");
    expect(at(85)).toBe("good");
    expect(at(92)).toBe("premium");
    expect(at(97)).toBe("exceptional");
  });

  it("never calls a site premium without the strict browser-verified gate", () => {
    expect(qualityBand({ score: 98, blockers: [], productionReady: false })).toBe("good");
  });
});

describe("team scorecard", () => {
  it("covers every category exactly once", () => {
    const owned = Object.values(TEAM_CATEGORIES).flat().sort();
    expect(owned).toEqual((Object.keys(CATEGORY_WEIGHTS) as QualityCategory[]).sort());
  });

  it("splits earned points and blockers by owner", () => {
    const categories = (Object.keys(CATEGORY_WEIGHTS) as QualityCategory[]).map((name) => ({
      name,
      weight: CATEGORY_WEIGHTS[name],
      earned: name === "data" ? 0 : CATEGORY_WEIGHTS[name],
    }));
    const team = teamScorecard(categories, [blocker]);
    expect(team.sol.score).toBe(100);
    expect(team.terra.score).toBe(100);
    expect(team.luna.score).toBeLessThan(100);
    expect(team.luna.blockers).toBe(1);
    expect(weakestTeamArea(team)).toContain("search titles and business details");
  });

  it("says nothing when every area is strong", () => {
    const strong = { score: 95, categories: [], blockers: 0 };
    expect(weakestTeamArea({ sol: strong, terra: strong, luna: strong })).toBe("");
  });
});
