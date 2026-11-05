import { describe, expect, it } from "vitest";
import { AI_ASSISTANT_HOSTS, bucketSessions, classifyTrafficSource } from "./traffic-source";

describe("classifyTrafficSource", () => {
  it("puts every listed AI assistant host in the AI bucket", () => {
    for (const host of AI_ASSISTANT_HOSTS) expect(classifyTrafficSource(host)).toBe("ai");
  });
  it("handles subdomains, www, full addresses and utm_source=chatgpt.com", () => {
    expect(classifyTrafficSource("https://www.perplexity.ai/search?q=plumber")).toBe("ai");
    expect(classifyTrafficSource("https://labs.perplexity.ai/")).toBe("ai");
    expect(classifyTrafficSource("utm_source=chatgpt.com")).toBe("ai");
    expect(classifyTrafficSource("ChatGPT.com")).toBe("ai");
    expect(classifyTrafficSource("chatgpt")).toBe("ai");
  });
  it("keeps gemini.google.com and copilot.microsoft.com out of ordinary search", () => {
    expect(classifyTrafficSource("https://gemini.google.com/app")).toBe("ai");
    expect(classifyTrafficSource("https://www.google.com/")).toBe("search");
    expect(classifyTrafficSource("https://www.bing.com/search?q=x")).toBe("search");
  });
  it("does not match look-alike hosts", () => {
    expect(classifyTrafficSource("https://notchatgpt.com")).toBe("other");
    expect(classifyTrafficSource("https://claude.ai.evil.example")).toBe("other");
  });
  it("classifies social, direct and unknown referral", () => {
    expect(classifyTrafficSource("https://l.facebook.com/l.php")).toBe("social");
    expect(classifyTrafficSource("instagram")).toBe("social");
    expect(classifyTrafficSource("direct")).toBe("direct");
    expect(classifyTrafficSource(null)).toBe("direct");
    expect(classifyTrafficSource("referral")).toBe("other");
    expect(classifyTrafficSource("localblog.example")).toBe("other");
  });
});

describe("bucketSessions", () => {
  it("counts measured sessions only; zero stays zero", () => {
    expect(bucketSessions([])).toEqual({ search: 0, ai: 0, social: 0, direct: 0, other: 0 });
    const t = bucketSessions([
      { source: "direct", session_id: "a" },
      { source: "referral", session_id: "b" },
    ]);
    expect(t.ai).toBe(0);
    expect(t.direct).toBe(1);
    expect(t.other).toBe(1);
  });
  it("marks a whole session by the most specific source it recorded", () => {
    const t = bucketSessions([
      { source: "direct", session_id: "a" },
      { source: "chatgpt.com", session_id: "a" },
      { source: "direct", session_id: "b" },
      { source: "https://www.google.com/", session_id: "c" },
    ]);
    expect(t).toEqual({ search: 1, ai: 1, social: 0, direct: 1, other: 0 });
  });
  it("counts an event with no session once", () => {
    expect(bucketSessions([{ source: "claude.ai", session_id: null }]).ai).toBe(1);
  });
});
