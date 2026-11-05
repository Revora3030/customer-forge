import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/lib/doc-ingest/doc-ingest.functions", () => ({ readMenuDocument: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { MenuImportView } from "./MenuImport";
import type { IngestPreview } from "@/lib/doc-ingest/doc-ingest";

const noop = () => {};
const base = { selected: new Set<number>(), busy: false, message: null, onPick: noop, onToggle: noop, onAdd: noop, onReset: noop };

describe("MenuImportView", () => {
  it("starts with an upload button and the nothing-saved promise", () => {
    const html = renderToStaticMarkup(<MenuImportView {...base} preview={null} />);
    expect(html).toContain("Upload menu or price sheet");
    expect(html).toContain("Nothing is saved or shown on your website until you tick it");
  });

  it("shows what was read, a CSV table, and cited proposals with nothing pre-ticked", () => {
    const preview: IngestPreview = {
      fileName: "prices.csv",
      kind: "table",
      pages: [{ where: "row 2", text: "Service: Cut | Price: $35" }],
      table: [["Service", "Price"], ["Cut", "$35"]],
      proposals: [{ name: "Cut", priceText: "$35", price: 35, startingPrice: false, description: "", file: "prices.csv", where: "row 2" }],
      note: null,
    };
    const html = renderToStaticMarkup(<MenuImportView {...base} preview={preview} />);
    expect(html).toContain("What Revora read from prices.csv");
    expect(html).toContain('data-testid="menu-import-table"');
    expect(html).toContain("From prices.csv, row 2");
    expect(html).toContain("Add 0 services");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Add 0 services/);
  });
});
