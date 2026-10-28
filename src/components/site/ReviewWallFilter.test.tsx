import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewWall } from "@/components/site/LiveBlocks";

const row = (id: string, rating: number) => ({ id, author_name: `Customer ${id}`, rating, comment: `Genuine comment number ${id}` });
const wall = (rows: ReturnType<typeof row>[]) =>
  renderToStaticMarkup(<ReviewWall site={{ reviews: rows } as never} />);

describe("review wall filter", () => {
  it("offers rating filters only when they would change what is shown", () => {
    const mixed = wall([row("1", 5), row("2", 5), row("3", 4), row("4", 2)]);
    expect(mixed).toContain("Filter reviews");
    expect(mixed).toContain("5 stars");
    expect(mixed).toContain("min-h-11");
    // everything is listed before a visitor picks a filter, and the average stays visible
    expect(mixed.match(/<blockquote/g)).toHaveLength(4);
    expect(mixed).toContain("Average rating");
  });

  it("shows no filter for few reviews or one rating", () => {
    expect(wall([row("1", 5), row("2", 5), row("3", 5), row("4", 5)])).not.toContain("Filter reviews");
    expect(wall([row("1", 5), row("2", 3)])).not.toContain("Filter reviews");
  });
});
