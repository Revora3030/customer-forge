import { CITY_DISTRICTS, districtCounts, districtState, failedLabel, districtFailureSummary, type CitySnapshot, type DistrictId } from "@/lib/ai-city";
import { miniMapDots } from "@/lib/city-nav";

export type CityMiniMapProps = { snapshot?: CitySnapshot | undefined; selected: DistrictId; now: number; onSelect: (id: DistrictId) => void; onOpen: (id: DistrictId) => void };

const DOT: Record<ReturnType<typeof districtState>, string> = { working: "bg-success", attention: "bg-gold", idle: "bg-muted-foreground", unavailable: "bg-destructive" };

/**
 * JC-15: a small map in the corner of the 3D city. One dot per district, coloured by its recorded state.
 * Tapping a dot flies the camera there; tapping the district that is already chosen opens its panel.
 * Keys 1-7 keep working because these are ordinary buttons inside the city's key handler.
 * Hidden on phones, where the flat map and the district carousel already do this job with 44px targets.
 */
export function CityMiniMap({ snapshot, selected, now, onSelect, onOpen }: CityMiniMapProps) {
  return <nav aria-label="City mini-map" className="pointer-events-auto absolute bottom-3 right-3 z-20 hidden size-40 rounded-lg border border-white/15 bg-background/85 backdrop-blur md:block" data-testid="city-minimap">
    <span aria-hidden="true" className="absolute inset-x-[14%] top-1/2 h-px bg-border" />
    <span aria-hidden="true" className="absolute inset-y-[14%] left-1/2 w-px bg-border" />
    {miniMapDots().map((dot, index) => {
      const state = districtState(dot.id, snapshot, now);
      const counts = districtCounts(snapshot, dot.id, now);
      const failed = state === "attention" && (counts?.errors ?? 0) > 0;
      const chosen = dot.id === selected;
      const summary = counts ? `${counts.running} running, ${failedLabel(districtFailureSummary(snapshot, dot.id, now))}` : state;
      const name = CITY_DISTRICTS[index]?.name ?? dot.name;
      return <button key={dot.id} type="button" data-district={dot.id} data-state={failed ? "failed" : state} aria-pressed={chosen} aria-label={`${name}: ${summary}. ${chosen ? "Open it" : "Fly there"}`} title={`${index + 1} · ${name}`} onClick={() => (chosen ? onOpen(dot.id) : onSelect(dot.id))} style={{ left: `${dot.left}%`, top: `${dot.top}%` }} className={`absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-[10px] font-semibold text-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${chosen ? "border-gold ring-2 ring-gold" : "border-border"} ${failed ? "bg-destructive" : DOT[state]}`}>{index + 1}</button>;
    })}
  </nav>;
}
