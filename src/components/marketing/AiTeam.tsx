import { Sparkles } from "lucide-react";
import { Panel } from "@/components/app/Bits";
import { AI_TEAM_ROLES, teamModelName } from "@/lib/ai-team-public";

/**
 * Who builds and checks a Revora website. Roles are plain descriptions of the
 * work; the page says "leads", because the best model is chosen per task with
 * automatic failover.
 */
export function AiTeam() {
  return (
    <div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AI_TEAM_ROLES.map((role) => (
          <li key={role.id}>
            <Panel className="h-full p-5">
              <p className="flex items-center gap-2 font-display text-[15px] font-semibold">
                <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
                {role.role}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{role.job}</p>
              <p className="mt-3 text-[11px] tracking-wide text-muted-foreground uppercase">Led by</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {role.models.map((model) => (
                  <li key={model} className="rounded-full border border-border bg-elevated px-2.5 py-1 text-[12px] text-foreground">
                    {teamModelName(model)}
                  </li>
                ))}
              </ul>
            </Panel>
          </li>
        ))}
      </ul>
      <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
        The best model for each task is picked automatically, with failover if one is busy, and the lineup changes as better models
        arrive. The AI drafts; you review everything before it goes live.
      </p>
    </div>
  );
}
