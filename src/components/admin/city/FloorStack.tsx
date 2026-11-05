import { CITY_DISTRICTS, type CitySnapshot, type DistrictId } from "@/lib/ai-city";
import { FLOOR_LIGHT_LABEL, districtFloors, type FloorLight } from "@/lib/ai-city-floors";

const LIGHT_DOT: Record<FloorLight, string> = {
  unavailable: "bg-muted-foreground",
  failed: "bg-destructive",
  working: "bg-success motion-safe:animate-pulse",
  waiting: "bg-gold",
  idle: "bg-border",
};

const count = (value: number | null) => (value === null ? "unavailable" : String(value));

/**
 * JC-6: the floors of a district's tower, one per work source. The light is a
 * dot plus a word (never colour alone) and only the "working" dot pulses, and
 * not under reduced motion. A failed read says "unavailable", not 0.
 */
export function FloorStack({
  district,
  snapshot,
  now,
}: {
  district: DistrictId;
  snapshot: CitySnapshot | undefined;
  now: number;
}) {
  const floors = districtFloors(snapshot, district, now);
  const name = CITY_DISTRICTS.find((d) => d.id === district)?.name ?? "District";
  return (
    <section className="mt-5" aria-label={`${name} floors`} data-testid="floor-stack">
      <h3 className="text-xs font-semibold uppercase">Floors · one per work source</h3>
      {!floors ? (
        <p className="mt-2 text-xs text-muted-foreground">Floors unavailable.</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {floors.map((floor, index) => (
            <li
              key={floor.key}
              data-floor={floor.key}
              data-light={floor.light}
              className="rounded-md border border-border p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 break-words text-xs font-medium">
                  <span className="mr-1 text-muted-foreground">Floor {floors.length - index}</span>
                  {floor.label}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-[11px]">
                  <span
                    aria-hidden="true"
                    className={`inline-block size-2.5 rounded-full ${LIGHT_DOT[floor.light]}`}
                  />
                  {FLOOR_LIGHT_LABEL[floor.light]}
                </span>
              </div>
              {floor.light === "unavailable" ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  This source could not be read, so no counts are shown.
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {count(floor.running)} running · {count(floor.queued)} queued ·{" "}
                  {count(floor.failed)} failed (48h) · {count(floor.records)} records
                  {floor.table ? <span className="font-mono"> · {floor.table}</span> : null}
                  {floor.truncated ? " · newest records only, counts may be higher" : ""}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
