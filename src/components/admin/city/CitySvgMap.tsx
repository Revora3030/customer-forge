import type { KeyboardEvent } from "react";
import { CITY_DISTRICTS, districtCounts, districtState, failedLabel, districtFailureSummary, type CitySnapshot, type DistrictId } from "@/lib/ai-city";

export type CitySvgMapProps = { snapshot?: CitySnapshot | undefined; selected: DistrictId; now: number; onSelect: (id: DistrictId) => void };

/** Same colour rules as the 3D scene, read from the --city-* tokens so the palette stays in one place. */
const STATE_FILL: Record<ReturnType<typeof districtState>, string> = {
  working: "var(--city-ok)",
  attention: "var(--city-gold)",
  idle: "var(--city-structure)",
  unavailable: "var(--city-muted)",
};

/** District grid position (−7…7) to the 0…100 view box. */
const at = (value: number) => 50 + value * 5.6;

/**
 * Flat 2D map of the AI City for screens under 768px. Phones get the same
 * districts, states and selection as the 3D scene without loading three.js,
 * WebGL or a render loop. Each district is a keyboard-reachable button.
 */
export function CitySvgMap({ snapshot, selected, now, onSelect }: CitySvgMapProps) {
  const onKey = (id: DistrictId) => (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(id); }
  };
  return <svg viewBox="0 0 100 100" role="group" aria-label="AI City map" className="block h-full w-full" style={{ background: "var(--city-ground)" }} data-testid="city-svg-map">
    <rect x="47.5" y="0" width="5" height="100" fill="var(--city-road)" />
    <rect x="0" y="47.5" width="100" height="5" fill="var(--city-road)" />
    {CITY_DISTRICTS.filter(d => d.id !== "executive").map(d => {
      const state = districtState(d.id, snapshot, now);
      const counts = districtCounts(snapshot, d.id, now);
      const stroke = state === "attention" && (counts?.errors ?? 0) > 0 ? "var(--city-danger)" : STATE_FILL[state];
      return <line key={`c-${d.id}`} x1="50" y1="50" x2={at(d.position[0])} y2={at(d.position[1])} stroke={stroke} strokeWidth="0.8" strokeOpacity={state === "working" || state === "attention" ? 0.85 : 0.3} />;
    })}
    {CITY_DISTRICTS.map(d => {
      const state = districtState(d.id, snapshot, now);
      const counts = districtCounts(snapshot, d.id, now);
      const failed = state === "attention" && (counts?.errors ?? 0) > 0;
      const fill = failed ? "var(--city-danger)" : STATE_FILL[state];
      const isSelected = selected === d.id;
      const size = 9 + d.height * 1.2;
      const x = at(d.position[0]), y = at(d.position[1]);
      const summary = counts ? `${counts.running} running, ${failedLabel(districtFailureSummary(snapshot, d.id, now))}` : state;
      return <g key={d.id} role="button" tabIndex={0} aria-pressed={isSelected} aria-label={`${d.name}: ${summary}`} data-district={d.id} data-state={failed ? "failed" : state} className="cursor-pointer outline-none focus-visible:[&>rect:first-child]:stroke-[var(--city-light)]" onClick={() => onSelect(d.id)} onKeyDown={onKey(d.id)}>
        <rect x={x - size / 2} y={y - size / 2} width={size} height={size} rx="1.5" fill="var(--city-ground)" stroke={isSelected ? "var(--city-gold)" : fill} strokeWidth={isSelected ? 1.2 : 0.6} />
        <rect x={x - size / 4} y={y - size / 4} width={size / 2} height={size / 2} rx="0.8" fill={fill} fillOpacity={state === "idle" ? 0.5 : 0.9} />
        <text x={x} y={y + size / 2 + 4} textAnchor="middle" fontSize="3.2" fill={isSelected ? "var(--city-gold)" : "var(--city-light)"}>{d.name}</text>
      </g>;
    })}
  </svg>;
}
