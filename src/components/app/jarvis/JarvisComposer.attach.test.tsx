import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JarvisComposer } from "./JarvisComposer";

const noop = () => undefined;
const html = (value = "") => renderToStaticMarkup(
  <JarvisComposer value={value} onChange={noop} onSubmit={noop} maxLength={4000} busy={false} coarse={false} listening={false} interim=""
    onToggleMic={noop} readingPicture={false} picturePreview={null} onPicture={noop} mode="balanced" onModeChange={noop} onOpenCommands={noop} />,
);

describe("JarvisComposer (JC-45)", () => {
  it("offers an attach button limited to the attachment policy's text types", () => {
    const out = html();
    expect(out).toContain('aria-label="Attach a TXT, CSV or JSON file"');
    expect(out).toContain('accept=".txt,.csv,.json,text/plain,text/csv,application/json"');
    expect(out).toContain("multiple");
  });
  it("keeps the picture, commands and send controls", () => {
    const out = html("hello");
    for (const label of ["Build a demo from a picture", "Quick commands", "Response style", "Send", "Dictate"]) expect(out).toContain(`aria-label="${label}"`);
  });
});
