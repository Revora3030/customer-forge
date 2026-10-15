import { describe, expect, it } from "vitest";
import type { JarvisDiagnostics } from "./jarvis-diagnostics.server";

type Primitive = string | number | boolean | null;
type JsonShape<T> = T extends Primitive
  ? T
  : T extends (infer Item)[]
    ? JsonShape<Item>[]
    : T extends object
      ? { [Key in keyof T]: JsonShape<T[Key]> }
      : never;

// This assignment fails compilation if the public DTO regresses to unknown,
// functions, or another non-JSON leaf. It does not replace TanStack's checks.
const serializableContract = (value: JarvisDiagnostics): JsonShape<JarvisDiagnostics> => value;

describe("Jarvis public diagnostic contract", () => {
  it("round-trips an available error section and unavailable sections", () => {
    const value: JarvisDiagnostics = {
      checkedAt: "2026-10-15T02:22:00.000Z",
      sections: {
        errors: {
          status: "checked", note: "bounded sample",
          data: {
            sampledRows: 0, possiblyTruncated: false, groups: [],
            sentryForwardingConfigured: false, sentryIngestionVerified: false,
          },
        },
        builds: { status: "unavailable", note: "not checked", data: null },
        schema: { status: "unavailable", note: "not checked", data: null },
      },
    };
    expect(JSON.parse(JSON.stringify(serializableContract(value)))).toEqual(value);
  });
});
