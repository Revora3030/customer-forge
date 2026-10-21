import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProposalCard } from "./ProposalCard";
import { ResearchResultCard } from "./ResearchResultCard";
import { MAX_RESEARCH, RESEARCH_KEY, readResearchResults, rememberResearchResult } from "./research-results";

const noop = () => undefined;

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  };
}

describe("research.ask proposal card", () => {
  it("shows the question and an approval button that explains the one-time paid call", () => {
    const html = renderToStaticMarkup(
      <ProposalCard proposal={{ id: "research.ask", question: "What do roofers in Milan charge?", preset: "low" }} state={undefined} onApprove={noop} />,
    );
    expect(html).toContain("What do roofers in Milan charge?");
    expect(html).toContain("Approve and research");
    expect(html).toContain("(low)");
  });

  it("never reaches the demo-build fallback (no crash on a proposal without input)", () => {
    const html = renderToStaticMarkup(
      <ProposalCard proposal={{ id: "research.ask", question: "Market size for HVAC maintenance?", preset: "fast" }} state="done" onApprove={noop} />,
    );
    expect(html).toContain("Researched");
    expect(html).not.toContain("Build demo site");
  });
});

describe("research result card", () => {
  it("renders the answer with clickable citations and the research disclaimer", () => {
    const html = renderToStaticMarkup(
      <ResearchResultCard
        result={{
          question: "Q?",
          model: "sonar",
          text: "A grounded answer.",
          citations: ["https://example.com/a"],
          searchResults: [{ title: "Example", url: "https://example.com/a" }],
          at: "2026-10-21T00:00:00Z",
        }}
      />,
    );
    expect(html).toContain("A grounded answer.");
    expect(html).toContain('href="https://example.com/a"');
    expect(html).toContain("not a verified business fact");
  });
});

describe("research result memory", () => {
  it("survives a reload: a fresh read returns the stored answer", () => {
    const storage = memoryStorage();
    rememberResearchResult("m1:0", {
      question: "Q?", model: null, text: "Answer.", citations: ["https://example.com/a"],
      searchResults: [], at: "2026-10-21T00:00:00Z",
    }, storage);
    const reloaded = readResearchResults(storage);
    expect(reloaded["m1:0"]?.text).toBe("Answer.");
    expect(storage.map.has(RESEARCH_KEY)).toBe(true);
  });

  it(`caps at ${MAX_RESEARCH} entries and drops non-https citation urls`, () => {
    const storage = memoryStorage();
    for (let i = 0; i < MAX_RESEARCH + 10; i += 1) {
      rememberResearchResult(`m${i}:0`, {
        question: "Q?", model: null, text: "A", citations: ["javascript:alert(1)", "https://ok.example/x"],
        searchResults: [], at: "",
      }, storage);
    }
    const all = readResearchResults(storage);
    expect(Object.keys(all)).toHaveLength(MAX_RESEARCH);
    expect(all[`m${MAX_RESEARCH + 9}:0`]?.citations).toEqual(["https://ok.example/x"]);
  });
});
