import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, MAP_PAD, MAP_SPAN, MAP_TAP_SLOP_PX, FRAMED_VIEW, centerOn, panBy, pinchZoom, viewBoxOf, zoomAbout, type MapView } from "@/lib/city-nav";
import { CITY_DISTRICTS, districtCounts, districtState, failedLabel, districtFailureSummary, type CitySnapshot, type DistrictId } from "@/lib/ai-city";
import { districtStateWord } from "@/lib/a11y-announce";
import { skyLighting, type SkyMode, type WeatherState } from "@/lib/city-sky";
import { ApprovalBeaconsSvg } from "./ApprovalBeacons";

export type CitySvgMapProps = { snapshot?: CitySnapshot | undefined; selected: DistrictId; now: number; onSelect: (id: DistrictId) => void; skyMode?: SkyMode; weather?: WeatherState };

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
export function CitySvgMap({ snapshot, selected, now, onSelect, skyMode = "neutral", weather }: CitySvgMapProps) {
  // The camera starts framed on the whole city. One finger pans a zoomed map, two fingers pinch-zoom it,
  // and the buttons do the same for anyone who cannot pinch. A phone never loads WebGL, so there is no 3D orbit here.
  const [view, setView] = useState<MapView>(FRAMED_VIEW);
  const viewRef = useRef(view);
  viewRef.current = view;
  const update = (next: MapView) => { viewRef.current = next; setView(next); };
  const frame = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: MapView; distance: number; moved: boolean }>({ start: FRAMED_VIEW, distance: 0, moved: false });
  const suppressClick = useRef(false);
  /** Pixels per map unit for the current zoom (the square map is letterboxed inside the frame). */
  const scale = () => { const r = frame.current?.getBoundingClientRect(); return r ? Math.min(r.width, r.height) / (MAP_SPAN / viewRef.current.zoom) : 1; };
  const toMap = (clientX: number, clientY: number) => {
    const r = frame.current?.getBoundingClientRect(); const k = scale();
    const v = viewRef.current;
    return r ? { x: v.cx + (clientX - r.left - r.width / 2) / k, y: v.cy + (clientY - r.top - r.height / 2) / k } : { x: v.cx, y: v.cy };
  };
  const two = () => { const [a, b] = [...pointers.current.values()]; return a && b ? { a, b } : null; };
  const onDown = (event: PointerEvent) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pair = two();
    gesture.current = { start: viewRef.current, distance: pair ? Math.hypot(pair.a.x - pair.b.x, pair.a.y - pair.b.y) : 0, moved: pointers.current.size > 1 };
  };
  const onMove = (event: PointerEvent) => {
    const prev = pointers.current.get(event.pointerId);
    if (!prev) return;
    const pair = two();
    if (pair) {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const next = two();
      if (!next || !gesture.current.distance) return;
      const mid = toMap((next.a.x + next.b.x) / 2, (next.a.y + next.b.y) / 2);
      gesture.current.moved = true;
      update(zoomAbout(viewRef.current, pinchZoom(gesture.current.start.zoom, gesture.current.distance, Math.hypot(next.a.x - next.b.x, next.a.y - next.b.y)), mid));
      return;
    }
    const dx = event.clientX - prev.x, dy = event.clientY - prev.y;
    if (!gesture.current.moved && Math.hypot(dx, dy) < MAP_TAP_SLOP_PX) return; // still a tap
    if (!gesture.current.moved) { try { frame.current?.setPointerCapture?.(event.pointerId); } catch { /* pointer already gone */ } }
    gesture.current.moved = true;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const k = scale();
    update(panBy(viewRef.current, dx / k, dy / k));
  };
  const onUp = (event: PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (gesture.current.moved) suppressClick.current = true;
    if (pointers.current.size === 0) window.setTimeout(() => { suppressClick.current = false; }, 0); // DevSkim: ignore DS172411 -- Fixed callback, no untrusted data.
    else gesture.current = { start: viewRef.current, distance: 0, moved: true };
  };
  // Choosing a district (carousel, mini-map, keys 1-7) flies the zoomed map to it.
  useEffect(() => {
    const d = CITY_DISTRICTS.find(x => x.id === selected);
    if (d && viewRef.current.zoom > MAP_MIN_ZOOM) update(centerOn(viewRef.current, { x: at(d.position[0]), y: at(d.position[1]) }));
  }, [selected]);
  const zoomBy = (factor: number) => update(zoomAbout(viewRef.current, viewRef.current.zoom * factor, { x: viewRef.current.cx, y: viewRef.current.cy }));
  const onKey = (id: DistrictId) => (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(id); }
  };
  const control = "pointer-events-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border bg-background/90 text-foreground disabled:opacity-40";
  const lighting = skyLighting(skyMode, "var(--city-ground)");
  const rainDots = weather && weather.kind === "rain" && weather.density > 0
    ? Array.from({ length: Math.max(0, Math.min(40, Math.round(weather.density * 40))) }, (_, i) => ({
        x: ((i * 17) % 100),
        y: ((i * 29) % 100),
      }))
    : [];
  return <div ref={frame} className="relative h-full w-full touch-none select-none overflow-hidden" data-zoom={view.zoom.toFixed(2)} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClickCapture={(event) => { if (suppressClick.current) { event.stopPropagation(); event.preventDefault(); suppressClick.current = false; } }}>
  <div className="absolute left-3 top-3 z-20 flex flex-col gap-1.5" role="group" aria-label="Map zoom">
    <button type="button" className={control} aria-label="Zoom in" disabled={view.zoom >= MAP_MAX_ZOOM} onClick={() => zoomBy(1.5)}><Plus className="size-4" /></button>
    <button type="button" className={control} aria-label="Zoom out" disabled={view.zoom <= MAP_MIN_ZOOM} onClick={() => zoomBy(1 / 1.5)}><Minus className="size-4" /></button>
    <button type="button" className={control} aria-label="Reset map view" disabled={view.zoom === MAP_MIN_ZOOM} onClick={() => update(FRAMED_VIEW)}><RotateCcw className="size-4" /></button>
  </div>
  <svg viewBox={viewBoxOf(view)} role="group" aria-label="AI City map" className="block h-full w-full" style={{ background: lighting.background, touchAction: "none" }} data-testid="city-svg-map" data-sky={skyMode}>
    <rect x="47.5" y={-MAP_PAD} width="5" height={MAP_SPAN} fill="var(--city-road)" />
    <rect x={-MAP_PAD} y="47.5" width={MAP_SPAN} height="5" fill="var(--city-road)" />
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
      return <g key={d.id} role="button" tabIndex={0} aria-pressed={isSelected} aria-label={`${d.name}, ${districtStateWord(state, failed)}: ${summary}`} data-district={d.id} data-state={failed ? "failed" : state} className="cursor-pointer outline-none focus-visible:[&>rect:first-child]:stroke-[var(--city-light)]" onClick={() => onSelect(d.id)} onKeyDown={onKey(d.id)}>
        <rect x={x - size / 2} y={y - size / 2} width={size} height={size} rx="1.5" fill="var(--city-ground)" stroke={isSelected ? "var(--city-gold)" : fill} strokeWidth={isSelected ? 1.2 : 0.6} />
        <rect x={x - size / 4} y={y - size / 4} width={size / 2} height={size / 2} rx="0.8" fill={fill} fillOpacity={state === "idle" ? 0.5 : 0.9} />
        <text x={x} y={y + size / 2 + 4} textAnchor="middle" fontSize="3.2" fill={isSelected ? "var(--city-gold)" : "var(--city-light)"}>{d.name}</text>
        <text x={x} y={y + size / 2 + 7.4} textAnchor="middle" fontSize="2.7" fill="var(--city-light)" data-testid="district-state-text">{districtStateWord(state, failed)}</text>
      </g>;
    })}
    {rainDots.map((dot, i) => <line key={`r-${i}`} x1={dot.x} y1={dot.y} x2={dot.x} y2={dot.y + 3} stroke="var(--city-cyan)" strokeWidth="0.35" strokeOpacity={0.45} />)}
    <ApprovalBeaconsSvg />
  </svg>
  </div>;
}

