import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PackageSuggestionsView } from "@/components/app/PackageSuggestions";

const noop = () => undefined;
const packages = [{ name: "Interior reset", description: "Vacuum, wipe-down and glass cleaning inside the cabin.", category: "Interior" }];

describe("PackageSuggestionsView", () => {
  it("offers the button first and promises nothing is saved", () => {
    const html = renderToStaticMarkup(<PackageSuggestionsView packages={null} busy={false} message={null} onAsk={noop} onUse={noop} onDismiss={noop} />);
    expect(html).toContain("Suggest packages");
    expect(html).toContain("Nothing is saved or shown on your website until you press Save");
  });

  it("shows each draft with an edit button and no price", () => {
    const html = renderToStaticMarkup(<PackageSuggestionsView packages={packages} busy={false} message={null} onAsk={noop} onUse={noop} onDismiss={noop} />);
    expect(html).toContain("Interior reset");
    expect(html).toContain("Edit and add");
    expect(html).toContain("Not for me");
    expect(html).not.toContain("$");
  });

  it("explains a failure in words", () => {
    const html = renderToStaticMarkup(<PackageSuggestionsView packages={null} busy={false} message="No usable suggestions came back this time." onAsk={noop} onUse={noop} onDismiss={noop} />);
    expect(html).toContain("No usable suggestions came back this time.");
  });
});
