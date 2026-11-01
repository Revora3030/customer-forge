/**
 * Builder states for screenshots: the AI upgrade banner and the preview frame
 * skeleton, using the real components. ?state=skeleton|loaded|requested.
 * No network beyond this local server; the approve button only logs.
 */
import "@/styles.css";
import { createRoot } from "react-dom/client";
import { AiUpgradeBanner } from "@/components/app/AiUpgradeBanner";
import { SiteSkeleton } from "@/components/site/SiteSkeleton";
import { readAiUpgradeFollowUps } from "@/lib/builder/ai-upgrade-followups";

const state = new URLSearchParams(location.search).get("state") ?? "skeleton";
if (state !== "requested") localStorage.clear();
// Same shape PR1's facts-only fallback records (generation.report.followUps).
const followUps = readAiUpgradeFollowUps({
  report: {
    followUps: [
      { kind: "layout_upgrade", status: "pending", reason: "Sample", slots: ["hero", "services"], recordedAt: "2026-11-01T10:00:00Z" },
      { kind: "copy_upgrade", status: "pending", reason: "Sample", slots: ["headline"], recordedAt: "2026-11-01T10:00:00Z" },
    ],
  },
});

function Builder() {
  return (
    <div className="min-h-screen bg-muted/30 p-4 font-sans text-foreground">
      <div className="mx-auto max-w-[900px]">
        <AiUpgradeBanner organizationId="sample-org" followUps={followUps} canManage onApprove={(text) => console.log("queued (harness only):", text)} />
        <div className="relative mx-auto overflow-hidden rounded-lg border border-border bg-background shadow-lift" style={{ width: 860, height: 560 }}>
          {state === "skeleton" ? (
            <SiteSkeleton label="Loading your preview…" />
          ) : (
            <iframe title="Draft preview (sample)" src="/p-sample" style={{ width: 860, height: 560, border: 0 }} />
          )}
        </div>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Builder />);
