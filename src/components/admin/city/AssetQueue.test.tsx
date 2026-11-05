import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AssetQueueView } from "./AssetQueue";
import { buildAssetQueue } from "@/lib/ai-city-assets";

const empty = buildAssetQueue({
  records: [],
  total: 0,
  workspaces: new Map(),
  previews: new Map(),
  checkedAt: "now",
});

describe("AssetQueueView", () => {
  it("says unavailable when the feed can't be read", () => {
    const html = renderToStaticMarkup(
      <AssetQueueView
        data={buildAssetQueue({
          records: null,
          total: null,
          workspaces: new Map(),
          previews: new Map(),
          checkedAt: "now",
        })}
        loading={false}
        failed={false}
        now={0}
      />,
    );
    expect(html).toContain("Asset queue unavailable");
  });

  it("shows an empty queue honestly and marks voice and motion as not recorded", () => {
    const html = renderToStaticMarkup(
      <AssetQueueView data={empty} loading={false} failed={false} now={0} />,
    );
    expect(html).toContain("No pictures are waiting for review.");
    expect(html.match(/not recorded/g)).toHaveLength(2);
    expect(html).toContain("nothing is made or approved here");
  });
});
