import { describe, it } from "vitest";
import { interpret } from "./interpreter";

describe("probe", () => {
  it("verbs", () => {
    const i = interpret("Make the home page headline clearer and add a strong call to action.", []);
    console.log(JSON.stringify({ verbs: i.verbs, sectionKinds: i.sectionKinds, pageHints: (i as any).pageHints, newPages: i.newPages, requirements: (i as any).requirements }, null, 1));
  });
});
