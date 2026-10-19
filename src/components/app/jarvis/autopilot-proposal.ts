import { useServerFn } from "@tanstack/react-start";
import type { WriteProposal } from "@/lib/jarvis-actions";
import { runProspectAutopilotNowFn, saveProspectAutopilotFn } from "@/lib/prospect-autopilot.functions";

export type AutopilotProposal = Extract<WriteProposal, { id: "autopilot.configure" | "autopilot.run" }>;

export const isAutopilotProposal = (proposal: WriteProposal): proposal is AutopilotProposal =>
  proposal.id === "autopilot.configure" || proposal.id === "autopilot.run";

/** Runs an approved autopilot proposal; resolves to a plain-language result for a toast. */
export function useApproveAutopilotProposal() {
  const save = useServerFn(saveProspectAutopilotFn);
  const run = useServerFn(runProspectAutopilotNowFn);
  return async (proposal: AutopilotProposal): Promise<string> => {
    if (proposal.id === "autopilot.configure") {
      const settings = await save({ data: proposal.settings });
      return settings.enabled ? "Autopilot settings saved. It runs every hour." : "Autopilot settings saved. Autopilot is off.";
    }
    const result = await run();
    if (result.status === "disabled") return "Autopilot is off, so nothing ran. Turn it on first.";
    if (result.status === "busy") return "An autopilot run is already going.";
    if (result.status === "failed") throw new Error(`The autopilot run stopped: ${result.error ?? "unknown error"}`);
    return `Autopilot found ${result.found}, built ${result.built}, emailed ${result.emailed} and texted ${result.texted}.`;
  };
}
