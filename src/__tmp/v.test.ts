import { it } from "vitest";
import { readFileSync } from "fs";
import { validateComposition, readComposition } from "@/lib/builder/composition-tree";
it("v", () => {
  const s = JSON.parse(readFileSync("/tmp/s.json","utf8"));
  console.log("read:", !!readComposition(s));
  console.log(JSON.stringify(validateComposition(s.composition)).slice(0,600));
});
