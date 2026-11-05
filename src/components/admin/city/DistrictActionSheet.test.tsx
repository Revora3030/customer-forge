import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DistrictCarousel } from "./DistrictCarousel";

describe("DistrictCarousel tap-to-act", () => {
  it("hints the long-press only when drafts can be opened", () => {
    const noop = () => undefined;
    expect(renderToStaticMarkup(<DistrictCarousel selected="growth" snapshot={undefined} now={0} onSelect={noop} onOpen={noop} onDraft={noop} />)).toContain("hold for actions");
    expect(renderToStaticMarkup(<DistrictCarousel selected="growth" snapshot={undefined} now={0} onSelect={noop} onOpen={noop} />)).not.toContain("hold for actions");
  });
});
