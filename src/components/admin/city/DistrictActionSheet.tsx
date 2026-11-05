import { Link } from "@tanstack/react-router";
import { ArrowUpRight, FileText, MessageSquare, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CITY_DISTRICTS, type CitySnapshot, type DistrictId } from "@/lib/ai-city";
import { tapActions } from "@/lib/city-tap-actions";

const ICON = { brief: FileText, check: ScanSearch, open: ArrowUpRight, ask: MessageSquare } as const;

/** JC-12: bottom action sheet for a long-pressed district. Draft actions only open Jarvis with a draft. */
export function DistrictActionSheet({ district, snapshot, now, onClose, onDraft }: { district: DistrictId | null; snapshot: CitySnapshot | undefined; now: number; onClose: () => void; onDraft: (draft: string) => void }) {
  const info = CITY_DISTRICTS.find((d) => d.id === district);
  const actions = district ? tapActions(district, snapshot, now) : [];
  return (
    <Sheet open={!!info} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader className="text-left">
          <SheetTitle>{info?.name ?? "District"}</SheetTitle>
          <SheetDescription>Each action opens a read-only draft in Jarvis. Nothing runs, sends or spends until you approve it.</SheetDescription>
        </SheetHeader>
        <ul className="mt-4 grid gap-2" aria-label="District actions">
          {actions.map((action) => {
            const Icon = ICON[action.id];
            const body = <><Icon className="size-4 shrink-0" aria-hidden="true" /><span className="min-w-0"><span className="block text-sm">{action.label}</span><span className="block break-words text-[11px] font-normal text-muted-foreground">{action.hint}</span></span></>;
            return (
              <li key={action.id}>
                {action.kind === "link"
                  ? <Button asChild variant="outline" className="h-auto min-h-12 w-full justify-start gap-3 whitespace-normal py-2 text-left"><Link to={action.to} onClick={onClose}>{body}</Link></Button>
                  : <Button variant="outline" data-source={action.source} className="h-auto min-h-12 w-full justify-start gap-3 whitespace-normal py-2 text-left" onClick={() => { onClose(); onDraft(action.draft); }}>{body}</Button>}
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
