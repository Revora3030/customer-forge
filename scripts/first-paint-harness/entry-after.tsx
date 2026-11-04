/** AFTER (/p): the server already sent the page; the bundle only hydrates it. */
import { hydrateRoot } from "react-dom/client";
import { SampleSite } from "./SampleSite";
import { FIXTURE_SECTIONS } from "./fixture";

hydrateRoot(document.getElementById("root")!, <SampleSite sections={FIXTURE_SECTIONS} />);
