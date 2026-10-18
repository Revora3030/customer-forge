import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { JarvisComposer } from "./JarvisComposer";
import { ProposalCard } from "./ProposalCard";

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

/** Every <button> must have an accessible name: an aria-label or visible text. */
function unnamedButtons(html: string) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].filter(([, attrs, inner]) => {
    if (/aria-label="[^"]+"/.test(attrs ?? "")) return false;
    const visible = (inner ?? "").replace(/<[^>]+aria-hidden="true"[^>]*>[\s\S]*?<\/[^>]+>/g, "").replace(/<[^>]+>/g, "").replace(/[<>]/g, "").trim();
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
