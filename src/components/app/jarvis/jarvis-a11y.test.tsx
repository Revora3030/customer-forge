import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { JarvisComposer } from "./JarvisComposer";
import { ProposalCard } from "./ProposalCard";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { districtStateWord, newFailureAnnouncement, stepAnnouncement } from "@/lib/a11y-announce";

const noop = () => undefined;
const render = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);

const composer = (overrides: Partial<Parameters<typeof JarvisComposer>[0]> = {}) => render(
  <JarvisComposer
    value=""
    onChange={noop}
    onSubmit={noop}
    maxLength={4000}
    busy={false}
    coarse
    listening={false}
    interim=""
    onToggleMic={noop}
    readingPicture={false}
    picturePreview={null}
    onPicture={noop}
    mode="balanced"
    onModeChange={noop}
    onOpenCommands={noop}
    {...overrides}
  />,
);

/** Characters outside any tag, read one by one (no regex tag stripping). */
function textOutsideTags(html: string) {
  let out = "";
  let depth = 0;
  for (const ch of html) {
    if (ch === "<") depth += 1;
    else if (ch === ">") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out;
}

/** Every <button> must have an accessible name: an aria-label or visible text. */
function unnamedButtons(html: string) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].filter(([, attrs, inner]) => {
    if (/aria-label="[^"]+"/.test(attrs ?? "")) return false;
    // Decorative icons are aria-hidden SVGs with no text, so text outside tags is the visible name.
    const visible = textOutsideTags(inner ?? "").trim();
    return !visible;
  });
}

describe("Jarvis composer accessibility", () => {
  it("renders a labelled 'Message Jarvis' textbox with the 4,000 character limit", () => {
    const html = composer();
    expect(html).toContain('<label for="jarvis-message" class="sr-only">Message Jarvis</label>');
    expect(html).toMatch(/<textarea[^>]*id="jarvis-message"[^>]*maxLength="4000"/);
    expect(html).toContain('placeholder="Message Jarvis"');
    expect(html).toContain('enterKeyHint="enter"');
  });

  it("labels every icon button and exposes pressed state on the mic", () => {
    const html = composer();
    for (const label of ["Build a demo from a picture", "Quick commands", "Response style", "Dictate", "Send"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toMatch(/aria-label="Dictate"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*aria-label="Dictate"/);
    expect(unnamedButtons(html)).toEqual([]);
    expect(composer({ listening: true })).toContain('aria-label="Stop microphone"');
  });

  it("keeps Send visibly disabled until there is text, and shows the counter past 3,000", () => {
    expect(composer()).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(composer({ value: "hello" })).not.toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(composer({ value: "x".repeat(3001) })).toContain("3001/4000");
  });
});

describe("Jarvis proposal card", () => {
  it("shows the exact approve button and disclaimer for a pull request", () => {
    const html = render(<ProposalCard proposal={{ id: "code.pr", pr: { title: "Fix", summary: "Why", changes: [{ path: "src/a.ts", content: "x" }] } }} state={undefined} onApprove={noop} />);
    expect(html).toContain("Approve and open pull request");
    expect(html).toContain("Opens a pull request into lovable-sync. Nothing merges until you merge it on GitHub.");
    expect(unnamedButtons(html)).toEqual([]);
    expect(html).not.toMatch(/text-\[1[01]px\]/);
  });

  it("stays approved after a reload: a remembered url renders the link, not the button", () => {
    const html = render(<ProposalCard proposal={{ id: "claude.code", request: "Add a FAQ" }} state="done" url="https://github.com/o/r/issues/1" onApprove={noop} />);
    expect(html).toContain("Follow it on GitHub");
    expect(html).not.toContain("Approve and send to Claude Code");
    const recover = render(<ProposalCard proposal={{ id: "builds.recover" }} state="done" onApprove={noop} />);
    expect(recover).toMatch(/<button[^>]*disabled=""[^>]*>Done<\/button>/);
  });
});

describe("Jarvis live region and focus (JC-62)", () => {
  it("announces the step Jarvis is on, then a failure, then the last done step", () => {
    expect(stepAnnouncement([])).toBe("");
    expect(stepAnnouncement([{ label: "Read the site", status: "done" }, { label: "Write copy", status: "running" }])).toBe("Jarvis is working on: Write copy");
    expect(stepAnnouncement([{ label: "Read the site", status: "done" }, { label: "Publish", status: "failed" }])).toBe("Step failed: Publish");
    expect(stepAnnouncement([{ label: "Read the site", status: "done" }])).toBe("Step done: Read the site");
  });

  it("the live task tree has a polite, always-mounted status, and the controls show focus", () => {
    const read = (file: string) => readFileSync(join(process.cwd(), "src/components/app/jarvis", file), "utf8");
    const tree = read("RunTaskTree.tsx");
    expect(tree).toContain('data-testid="jarvis-step-live"');
    expect(tree).toContain('aria-live="polite"');
    expect(tree).toContain("focus-visible:outline-2");
    expect(read("JarvisMessage.tsx")).toContain("focus-visible:outline-2");
  });

  it("the composer frame shows a ring while the field has focus", () => {
    expect(composer()).toContain("focus-within:ring-2");
  });
});

describe("City state words and failure announcements (JC-62)", () => {
  it("says nothing on the first read or when failures fall, and counts new ones", () => {
    expect(newFailureAnnouncement(null, 3)).toBe("");
    expect(newFailureAnnouncement(2, 2)).toBe("");
    expect(newFailureAnnouncement(3, 1)).toBe("");
    expect(newFailureAnnouncement(0, 1)).toBe("1 new failure in the AI City. 1 failed in total.");
    expect(newFailureAnnouncement(1, 4)).toContain("3 new failures");
  });

  it("gives every district state a plain word", () => {
    expect(districtStateWord("working", false)).toBe("Working");
    expect(districtStateWord("attention", false)).toBe("Needs attention");
    expect(districtStateWord("idle", false)).toBe("Idle");
    expect(districtStateWord("unavailable", false)).toBe("Unavailable");
    expect(districtStateWord("working", true)).toBe("Failed");
  });
});
