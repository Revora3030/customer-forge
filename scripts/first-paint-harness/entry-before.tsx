/**
 * BEFORE (the old builder frame, /draft): an empty HTML shell; the bundle
 * shows "Loading your draft…", asks the server for the draft, then draws it.
 */
import { createRoot } from "react-dom/client";
import { SampleSite } from "./SampleSite";
import type { FixtureSection } from "./fixture";

const root = createRoot(document.getElementById("root")!);
root.render(<p style={{ padding: 24, fontFamily: "system-ui" }}>Loading your draft…</p>);
void fetch("/api/draft")
  .then((response) => response.json() as Promise<FixtureSection[]>)
  .then((sections) => root.render(<SampleSite sections={sections} />));
