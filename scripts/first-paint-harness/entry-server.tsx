import { renderToString } from "react-dom/server";
import { SampleSite } from "./SampleSite";
import { FIXTURE_SECTIONS } from "./fixture";
import { heroPreloadLink } from "@/lib/site-hero-preload";
import { privatePreviewHeaders } from "@/lib/page-cache";

export function render() {
  return {
    html: renderToString(<SampleSite sections={FIXTURE_SECTIONS} />),
    preload: heroPreloadLink(FIXTURE_SECTIONS),
    headers: privatePreviewHeaders(),
  };
}
export const sections = FIXTURE_SECTIONS;
