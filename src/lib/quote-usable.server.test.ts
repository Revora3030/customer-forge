import { describe, expect, it } from "vitest";
import { usableQuoteFormIds } from "@/lib/quote-usable.server";

type Row = Record<string, unknown>;

function database(tables: Record<string, Row[]>, failing?: string) {
  return {
    from(table: string) {
      const predicates: Array<(row: Row) => boolean> = [];
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          predicates.push((row) => row[key] === value);
          return query;
        },
        in: (key: string, values: unknown[]) => {
          predicates.push((row) => values.includes(row[key]));
          return query;
        },
        then: (resolve: (result: unknown) => unknown) =>
          Promise.resolve(
            failing === table
              ? { data: null, error: { message: "fixture failure" } }
              : { data: (tables[table] ?? []).filter((row) => predicates.every((p) => p(row))), error: null },
          ).then(resolve),
      };
      return query;
    },
  } as never;
}

const A = "org-a";
const B = "org-b";

const tables = {
  quote_forms: [
    { id: "usable", organization_id: A, is_active: true },
    { id: "no-questions", organization_id: A, is_active: true },
    { id: "optionless", organization_id: A, is_active: true },
    { id: "inactive", organization_id: A, is_active: false },
    { id: "other-org", organization_id: B, is_active: true },
  ],
  quote_questions: [
    { id: "q1", form_id: "usable", organization_id: A },
    { id: "q2", form_id: "usable", organization_id: A },
    { id: "q3", form_id: "optionless", organization_id: A },
    { id: "q4", form_id: "inactive", organization_id: A },
    { id: "q5", form_id: "other-org", organization_id: B },
    // A question row pointing at org A's form but stored under another org is ignored.
    { id: "q6", form_id: "no-questions", organization_id: B },
  ],
  quote_options: [
    { id: "o1", question_id: "q1", organization_id: A },
    { id: "o4", question_id: "q4", organization_id: A },
    { id: "o5", question_id: "q5", organization_id: B },
    { id: "o6", question_id: "q6", organization_id: B },
  ],
};

describe("usableQuoteFormIds", () => {
  it("counts only active forms with at least one question that has an option", async () => {
    expect(await usableQuoteFormIds(database(tables), A)).toEqual(["usable"]);
  });

  it("a form with no questions, or only option-less questions, is not usable", async () => {
    const onlyEmpty = {
      quote_forms: tables.quote_forms.filter((row) => row.id === "no-questions" || row.id === "optionless"),
      quote_questions: tables.quote_questions,
      quote_options: tables.quote_options,
    };
    expect(await usableQuoteFormIds(database(onlyEmpty), A)).toEqual([]);
  });

  it("is scoped to the workspace", async () => {
    expect(await usableQuoteFormIds(database(tables), B)).toEqual(["other-org"]);
    expect(await usableQuoteFormIds(database(tables), "org-c")).toEqual([]);
  });

  it("fails closed when a read fails", async () => {
    await expect(usableQuoteFormIds(database(tables, "quote_options"), A)).rejects.toThrow("quote options");
  });
});
