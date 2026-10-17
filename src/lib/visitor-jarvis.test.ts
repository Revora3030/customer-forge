import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseVisitorReply } from "@/lib/visitor-jarvis";
import { visitorSystemPrompt } from "@/lib/visitor-jarvis.functions";

describe("Jarvis for visitors", () => {
  it("separates the reply from one next-step action and strips markup", () => {
    expect(parseVisitorReply("You can bring your current site.\n[[upgrade]]")).toEqual({ reply: "You can bring your current site.", action: "upgrade" });
    expect(parseVisitorReply("Sure <b>thing</b> [[pricing]] [[start]]").action).toBe("pricing");
    expect(parseVisitorReply("Hi <scr<script>ipt>alert(1)").reply).not.toMatch(/[<>]/);
    expect(parseVisitorReply("[[delete everything]]")).toEqual({ reply: "Happy to help. What kind of business do you run?", action: null });
  });

  it("states the real offer and forbids invented claims", () => {
    const prompt = visitorSystemPrompt("/pricing");
    expect(prompt).toContain("$350.00 one-time setup");
    expect(prompt).toContain("$100.00/month");
    expect(prompt).toContain("never invent features");
    expect(prompt).toContain("Never ask for passwords or card details");
  });

  it("runs on free models only, rate-limited, and is mounted on every marketing page", () => {
    const fns = readFileSync("src/lib/visitor-jarvis.functions.ts", "utf8");
    expect(fns).toContain("freeOnly: true");
    expect(fns).toContain("if (!allow(visitorKey()))");
    expect(readFileSync("src/components/marketing/Chrome.tsx", "utf8")).toContain("<VisitorJarvis />");
  });
});
