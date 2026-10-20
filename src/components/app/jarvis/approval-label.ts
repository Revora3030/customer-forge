const LABELS: Record<string, string> = {
  "jarvis.pull_request.opened": "Opened a pull request",
  "jarvis.builds.recovered": "Restarted stalled builds",
  "jarvis.claude_code.requested": "Sent a task to Claude Code",
  "jarvis.claude_code.fix_requested": "Asked Claude Code to fix a pull request",
  "jarvis.prospect_demo.created": "Built a demo website",
  "jarvis.prospects.search": "Searched Google Maps for businesses",
};

/** Plain-language name for a logged Jarvis action; unknown ones are shown readably, never hidden. */
export function approvalLabel(action: string): string {
  return LABELS[action] ?? action.replace(/^jarvis\./, "").replace(/[._]/g, " ").replace(/^./, (c) => c.toUpperCase());
}
