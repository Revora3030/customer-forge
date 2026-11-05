/**
 * Shared "Fix it with AI" control for a finding (LOV-5).
 *
 * Takes `{ title, plainReason, scope }`. AI-fixable findings get a "Fix it"
 * button that hands a scoped request to the builder chat (a draft the owner can
 * undo; nothing is published). Findings only the owner can resolve show
 * "Needs your answer" instead of a button that would guess.
 */

import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askAssistant } from "@/lib/assistant-bridge";
import {
  buildFixAllRequest,
  buildFixRequest,
  isAiFixable,
  splitFixAll,
  type FixFinding,
} from "@/lib/fix-it";

export function FixItButton({ finding }: { finding: FixFinding }) {
  if (!isAiFixable(finding)) {
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid="fix-it-needs-owner">
        <span className="text-[12px] font-medium">Needs your answer</span>
        <Button asChild size="sm" variant="outline">
          <Link to="/app/website" aria-label={`Open the website editor: ${finding.title}`}>
            Open editor
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => askAssistant(buildFixRequest(finding))}
      aria-label={`Fix it with AI: ${finding.title}`}
    >
      <Sparkles className="mr-1 size-3.5" aria-hidden />
      Fix it
    </Button>
  );
}

/** "Fix all" for the AI-fixable findings in a list; hidden when fewer than two. */
export function FixAllButton({ findings }: { findings: readonly FixFinding[] }) {
  const { fixable } = splitFixAll(findings);
  if (fixable.length < 2) return null;
  return (
    <Button size="sm" onClick={() => askAssistant(buildFixAllRequest(fixable))}>
      <Sparkles className="mr-1 size-3.5" aria-hidden />
      Fix all {fixable.length}
    </Button>
  );
}
