import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import { FIXTURE_NAME, type FixtureSection } from "./fixture";

/** The fictional sample page, drawn by the real section renderer. */
export function SampleSite({ sections }: { sections: FixtureSection[] }) {
  return (
    <div style={{ background: "#0b0f14", color: "#f5f7fa", minHeight: "100vh" }}>
      <header style={{ display: "flex", justifyContent: "space-between", padding: "16px 20px", fontWeight: 700 }}>
        <span>{FIXTURE_NAME}</span>
        <span aria-hidden="true">☰</span>
      </header>
      <main>
        {sections.map((section, index) => (
          <CompositionRenderer
            key={section.id}
            tree={section.settings.composition}
            scope={`fx${index}`}
            eagerFirstMedia={index === 0}
            resolveMedia={(ref) => {
              const found = section.components.find((c) => c.id === ref);
              return found ? { url: found.url, visual: found.settings.visual } : null;
            }}
          />
        ))}
      </main>
    </div>
  );
}
