import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CSV_HEADER, categoryOf, csvCell, latestRelease, leadRow, matchesTrade, parseArgs, placeFileNames, rowGroupMayOverlap, toCsv,
} from "../../scripts/overture-leads.mjs";
import { normalizeLeadRow, readImport } from "./prospect-lead-import";

/** Rows shaped like the real Overture release 2026-10-21.0 (taxonomy, not the older categories). */
const place = (over: Record<string, unknown> = {}) => ({
  id: "place-1",
  confidence: 0.92,
  names: { primary: "The Art of Plumbing" },
  websites: ["https://www.theartofplumbing.net/"],
  phones: ["9197991854"],
  emails: [],
  addresses: [{ freeform: "205 Brookridge Dr", locality: "Cary", postcode: "27518", region: "NC", country: "US" }],
  operating_status: "open",
  basic_category: "home_service",
  taxonomy: { primary: "plumbing", hierarchy: ["services_and_business", "home_service", "plumbing"] },
  bbox: { xmin: -78.7716, xmax: -78.7716, ymin: 35.7185, ymax: 35.7185 },
  ...over,
});
const context = { release: "2026-10-21.0", city: "Cary", anyCity: false, minConfidence: 0.6, today: "2026-10-29" };

describe("parseArgs", () => {
  it("reads a city search, with --key value or --key=value", () => {
    expect(parseArgs(["--city", "Cary", "--state", "nc", "--trade", "Plumbing, roofing", "--limit", "50"])).toMatchObject({ city: "Cary", state: "NC", trade: ["plumbing", "roofing"], limit: 50, minConfidence: 0.6, anyCity: false });
    expect(parseArgs(["--bbox=-78.8,35.7,-78.5,35.9", "--trade=plumbing"])).toMatchObject({ bbox: [-78.8, 35.7, -78.5, 35.9], out: "overture-leads.csv" });
  });

  it("caps the row count at what one import accepts, and says what is missing", () => {
    expect(parseArgs(["--city", "Cary", "--state", "NC", "--trade", "plumbing", "--limit", "9999"]).limit).toBe(300);
    expect(() => parseArgs(["--city", "Cary", "--trade", "plumbing"])).toThrow(/two-letter --state/);
    expect(() => parseArgs(["--city", "Cary", "--state", "NC"])).toThrow(/--trade/);
    expect(() => parseArgs(["--bbox", "1,2,3", "--trade", "plumbing"])).toThrow(/--bbox/);
    expect(parseArgs(["--city", "Cary", "--state", "NC", "--list-categories"]).listCategories).toBe(true);
  });

  it("keeps only plain words from the city and trade, so nothing odd reaches a URL or a file", () => {
    const args = parseArgs(["--city", "Cary;rm -rf /", "--state", "NC", "--trade", "plumbing$(x),roof"]);
    expect(args.city).toBe("Caryrm -rf");
    expect(args.trade).toEqual(["plumbingx", "roof"]);
  });
});

describe("release and file listings", () => {
  it("picks the newest release, comparing dates before the part number", () => {
    const xml = ["2026-09-23.0", "2026-09-23.1", "2026-10-21.0", "2026-10-21.10", "2026-10-21.2"].map((r) => `<Prefix>release/${r}/</Prefix>`).join("");
    expect(latestRelease(xml)).toBe("2026-10-21.10");
    expect(() => latestRelease("<ListBucketResult/>")).toThrow(/Couldn't find/);
  });

  it("lists the parquet files of a release", () => {
    expect(placeFileNames("<Key>release/x/theme=places/type=place/part-00000-a.zstd.parquet</Key><Key>release/x/_SUCCESS</Key>")).toEqual(["part-00000-a.zstd.parquet"]);
  });
});

describe("rowGroupMayOverlap", () => {
  const group = (xmin: number, xmax: number, ymin: number, ymax: number) => ({
    columns: [["bbox.xmin", xmin, xmin], ["bbox.xmax", xmax, xmax], ["bbox.ymin", ymin, ymin], ["bbox.ymax", ymax, ymax]].map(([path, min, max]) => ({ meta_data: { path_in_schema: String(path).split("."), statistics: { min: Number(min), max: Number(max) } } })),
  });
  const box = { west: -78.8, south: 35.7, east: -78.5, north: 35.9 };

  it("skips a row group wholly outside the box and keeps one that touches it", () => {
    expect(rowGroupMayOverlap(group(-120, -110, 30, 40), box)).toBe(false);
    expect(rowGroupMayOverlap(group(-79, -78, 35, 36), box)).toBe(true);
  });

  it("reads a row group with no statistics rather than miss places", () => {
    expect(rowGroupMayOverlap({ columns: [] }, box)).toBe(true);
  });
});

describe("matching and rows", () => {
  it("matches a trade against the place's category and its parents, in current and older releases", () => {
    expect(matchesTrade(place(), ["plumb"])).toBe(true);
    expect(matchesTrade(place(), ["home service"])).toBe(true);
    expect(matchesTrade(place(), ["roof"])).toBe(false);
    const old = { categories: { primary: "roofing_contractor" } };
    expect(categoryOf(old).primary).toBe("roofing_contractor");
    expect(matchesTrade(old, ["roofing"])).toBe(true);
  });

  it("writes the import columns from facts the place states, and nothing else", () => {
    const row = leadRow(place(), context)!;
    expect(row.cells).toEqual([
      "2026-10-29", "", "The Art of Plumbing", "205 Brookridge Dr, Cary, NC 27518", "9197991854", "", "https://www.theartofplumbing.net/", "Plumbing",
      "Overture Maps 2026-10-21.0", "9", "From Overture Maps places (confidence 0.92). Website and email not checked yet.",
    ]);
    expect(row.cells).toHaveLength(CSV_HEADER.length);
  });

  it.each([
    ["closed", { operating_status: "closed" }],
    ["no name", { names: { primary: " " } }],
    ["low confidence", { confidence: 0.4 }],
    ["nothing to check", { websites: [], emails: [] }],
    ["another city", { addresses: [{ freeform: "1 Main St", locality: "Durham", region: "NC", postcode: "27701" }] }],
  ])("leaves out a place that is %s", (_label, over) => {
    expect(leadRow(place(over), context)).toBeNull();
  });

  it("keeps a place in another city when the whole metro is wanted, and keeps an email-only place", () => {
    expect(leadRow(place({ addresses: [{ locality: "Durham", region: "NC" }] }), { ...context, anyCity: true })).not.toBeNull();
    expect(leadRow(place({ websites: [], emails: ["Owner@Shop.test"] }), context)?.cells[5]).toBe("owner@shop.test");
  });
});

describe("CSV output", () => {
  it("quotes commas, quotes and newlines, and defuses a cell a spreadsheet would run as a formula", () => {
    expect(csvCell('Smith, "Bob" & Sons')).toBe('"Smith, ""Bob"" & Sons"');
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("-evil")).toBe("'-evil");
    expect(csvCell("+19195550142")).toBe("+19195550142");
    expect(csvCell("(919) 555-0142")).toBe("(919) 555-0142");
  });

  it("imports cleanly into the Jarvis lead queue: every column is read, and nothing needs fixing", () => {
    const places = [place(), place({ id: "b", names: { primary: "Modern Plumbing, Inc." }, websites: ["https://modernplumbing.test/"], phones: ["+19193411911"], addresses: [{ freeform: "313 Sherwee Dr", locality: "Raleigh", postcode: "27603-3521", region: "NC" }] })];
    const csv = toCsv(places.map((p) => leadRow(p, { ...context, anyCity: true })!.cells));
    const parsed = readImport(csv);
    if (!parsed.ok) throw new Error(parsed.message);
    const results = parsed.rows.map((cells) => normalizeLeadRow(cells, parsed.fields, { category: null }));
    expect(results).toMatchObject([
      { lead: { businessName: "The Art of Plumbing", city: "Cary", state: "NC", category: "Plumbing", website: "https://www.theartofplumbing.net", phone: "9197991854", score: 9, address: "205 Brookridge Dr" } },
      { lead: { businessName: "Modern Plumbing, Inc.", city: "Raleigh", state: "NC", category: "Plumbing", website: "https://modernplumbing.test", phone: "+19193411911", address: "313 Sherwee Dr" } },
    ]);
  });
});

describe("the script's own limits", () => {
  const source = readFileSync("scripts/overture-leads.mjs", "utf8");

  it("only reads public data: no credentials, no sending, and the two readers are the only imports", () => {
    expect(source).not.toMatch(/process\.env|apiKey|authorization|nodemailer|sendgrid|twilio/i);
    const imports = [...source.matchAll(/(?:import\(|from )"([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(imports)).toEqual(new Set(["node:fs", "node:url", "hyparquet", "hyparquet-compressors"]));
  });
});

describe("the Overture leads workflow", () => {
  const workflow = readFileSync(".github/workflows/overture-leads.yml", "utf8");

  it("is run by hand, reads the repo only and uses no secret", () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(workflow).not.toMatch(/secrets\./);
  });

  it("hands inputs to the script as environment variables, never pasted into the shell", () => {
    const run = workflow.slice(workflow.indexOf("- name: Find leads"), workflow.indexOf("- name: Summary"));
    expect(run).toContain("CITY: ${{ inputs.city }}");
    expect(run.slice(run.indexOf("run: |"))).not.toContain("${{");
  });

  it("installs only the two pinned readers, with install scripts off, outside the app's own dependencies", () => {
    expect(workflow).toContain("--ignore-scripts --save-exact hyparquet@1.31.5 hyparquet-compressors@1.1.2");
    expect(workflow).not.toMatch(/npm (install|ci)\s*$/m);
  });
});
