import { describe, expect, it } from "vitest";
import { CITY_COMMANDS, CITY_COMMAND_ENTRIES, expandCityCommand } from "./city-commands";

describe("JC-45 City commands", () => {
  it("ships exactly /city, /brief and /triage", () => {
    expect(CITY_COMMANDS.map((c) => c.slash)).toEqual(["/city", "/brief", "/triage"]);
    expect(CITY_COMMAND_ENTRIES.map(([label]) => label.split(" ")[0])).toEqual(["/city", "/brief", "/triage"]);
  });

  it("every prompt forbids invented data and acting without approval", () => {
    for (const c of CITY_COMMANDS) {
      expect(c.prompt.length).toBeLessThan(600);
      expect(c.prompt).toMatch(/NOT_VERIFIED|can't see evidence/);
    }
    expect(CITY_COMMANDS.find((c) => c.slash === "/triage")!.prompt).toMatch(/without my approval/);
    expect(CITY_COMMANDS.find((c) => c.slash === "/brief")!.prompt).toMatch(/propose only/);
  });

  it("expands a typed command, with extra words as focus", () => {
    expect(expandCityCommand("/brief")).toBe(CITY_COMMANDS[1]!.prompt);
    expect(expandCityCommand("  /TRIAGE builds only ")).toBe(`${CITY_COMMANDS[2]!.prompt}\nFocus: builds only`);
  });

  it("leaves everything else exactly as typed", () => {
    for (const text of ["/cityscape", "see /city", "/page", "city", ""]) expect(expandCityCommand(text)).toBe(text);
  });
});
