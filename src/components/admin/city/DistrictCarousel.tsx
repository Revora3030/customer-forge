import { useEffect, useRef, useState } from "react";
import { useLongPress } from "@/hooks/use-long-press";
import { DistrictActionSheet } from "./DistrictActionSheet";
import { CITY_DISTRICTS, districtCounts, districtState, type CitySnapshot, type DistrictId } from "@/lib/ai-city";

const DOT: Record<string, string> = { working: "bg-success", attention: "bg-gold", idle: "bg-muted-foreground/50", unavailable: "bg-destructive" };

/**
 * Phone-only district switcher pinned in the thumb zone, so districts can be
 * changed with a swipe and a tap instead of fighting the 3D orbit gestures.
 * Choosing a district glides the camera to it; tapping the chosen one opens its panel.
 */
export function DistrictCarousel({ selected, snapshot, now, onSelect, onOpen, onDraft }: { selected: DistrictId; snapshot: CitySnapshot | undefined; now: number; onSelect: (id: DistrictId) => void; onOpen: (id: DistrictId) => void; onDraft?: (draft: string) => void }) {
  const active = useRef<HTMLButtonElement>(null);
  const [acting, setActing] = useState<DistrictId | null>(null);
  useEffect(() => { active.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }, [selected]);
  return (
    <nav aria-label="Districts" className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-background/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
      <ul className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {CITY_DISTRICTS.map((district) => {
          const state = districtState(district.id, snapshot, now);
          const counts = districtCounts(snapshot, district.id, now);
          const chosen = district.id === selected;
          const open = counts ? counts.queued + counts.errors : null;
          return (
            <li key={district.id} className="shrink-0 snap-center">
              <DistrictButton
                ref={chosen ? active : undefined}
                type="button"
                aria-pressed={chosen}
                aria-label={`${district.name}, ${state}${open ? `, ${open} need attention` : ""}`}
                onLongPress={onDraft ? () => setActing(district.id) : undefined}
                onClick={() => (chosen ? onOpen(district.id) : onSelect(district.id))}
                className={`flex min-h-14 min-w-[8.5rem] items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${chosen ? "border-gold bg-gold/10" : "border-border"}`}
              >
                <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${DOT[state] ?? DOT["idle"]}`} />
                <span className="min-w-0"><span className="block truncate font-medium">{district.name}</span><span className="block truncate text-[10px] text-muted-foreground">{chosen ? `${state} · ${onDraft ? "tap to open · hold for actions" : "tap to open"}` : state}{open ? ` · ${open} open` : ""}</span></span>
              </DistrictButton>
            </li>
          );
        })}
      </ul>
      {onDraft ? <DistrictActionSheet district={acting} snapshot={snapshot} now={now} onClose={() => setActing(null)} onDraft={onDraft} /> : null}
    </nav>
  );
}

type DistrictButtonProps = Omit<React.ComponentPropsWithRef<"button">, "onClick"> & { onClick: () => void; onLongPress?: (() => void) | undefined };
/** A carousel button where a long-press or right-click opens the JC-12 action sheet instead of tapping. */
function DistrictButton({ onClick, onLongPress, ref, ...rest }: DistrictButtonProps) {
  const press = useLongPress(() => onLongPress?.());
  return <button ref={ref} {...rest} {...(onLongPress ? press.props : {})} onClick={() => { if (!press.consumed()) onClick(); }} />;
}
