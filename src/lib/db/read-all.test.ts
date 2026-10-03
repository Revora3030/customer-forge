import { describe, expect, it } from "vitest";
import { readAll } from "./read-all";

const table = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));
const fake = (rows: { id: number }[], error: unknown = null) => () => ({
  range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error }),
});

describe("readAll", () => {
  it("reads past the 1,000-row page limit", async () => {
    const { data } = await readAll(fake(table(2501)));
    expect(data).toHaveLength(2501);
  });
  it("stops after a short page", async () => {
    const { data } = await readAll(fake(table(3)));
    expect(data).toHaveLength(3);
  });
  it("returns the error", async () => {
    const { error } = await readAll(fake(table(3), new Error("boom")));
    expect(error).toBeInstanceOf(Error);
  });
});
