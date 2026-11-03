import { expect, it } from "vitest";
import { readTriage } from "./conversation.server";

it("a change request skips the full inspection pass", () => {
  expect(readTriage({ mode: "change" })).toEqual({ mode: "change" });
});
it("a question needing evidence falls through to the full pass", () => {
  expect(readTriage({ mode: "inspect" })).toBeNull();
  expect(readTriage({ mode: "answer", reply: "" })).toBeNull();
});
