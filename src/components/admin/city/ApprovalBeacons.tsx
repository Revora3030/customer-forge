import { useContext } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CITY_DISTRICTS } from "@/lib/ai-city";
import { approvalBeaconLabel, beaconDistricts } from "@/lib/city-approval-beacons";
import { useApprovalBeacons, useOpenApprovals } from "./use-approval-beacons";

const ORDER = CITY_DISTRICTS.map((d) => d.id);
const at = (value: number) => 50 + value * 5.6;

/** Gold beacons over the flat 2D map. Still under reduced motion; pulses only when motion is allowed. */
function Svg() {
  const state = useApprovalBeacons();
  const open = useOpenApprovals();
  return (
    <g data-testid="approval-beacons-svg">
      {beaconDistricts(state, ORDER).map(({ id, count }) => {
        const d = CITY_DISTRICTS.find((district) => district.id === id)!;
        const x = at(d.position[0]) + 5,
          y = at(d.position[1]) - 5;
        return (
          <g
            key={id}
            role="button"
            tabIndex={0}
            aria-label={`${count} approval${count === 1 ? "" : "s"} waiting at ${d.name}. Open approvals`}
            data-beacon={id}
            className="cursor-pointer outline-none"
            onClick={(event) => {
              event.stopPropagation();
              open();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                open();
              }
            }}
          >
            <circle
              cx={x}
              cy={y}
              r="3.4"
              fill="var(--city-gold)"
              fillOpacity="0.28"
              className="motion-safe:animate-pulse"
            />
            <circle
              cx={x}
              cy={y}
              r="2.3"
              fill="var(--city-gold)"
              stroke="var(--city-light)"
              strokeWidth="0.3"
            />
            <text
              x={x}
              y={y + 0.9}
              textAnchor="middle"
              fontSize="2.6"
              fontWeight="700"
              fill="var(--city-ground)"
            >
              {count > 9 ? "9+" : count}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Renders nothing where there is no query client (static markup in tests). */
export function ApprovalBeaconsSvg() {
  return useContext(QueryClientContext) ? <Svg /> : null;
}

/**
 * The words behind the beacons, always in the page for keyboard and screen
 * readers: how many are waiting, where, and a way in. When the read fails it
 * says "unavailable"; it does not show 0.
 */
export function ApprovalBeaconStatus() {
  const state = useApprovalBeacons();
  const open = useOpenApprovals();
  const places = beaconDistricts(state, ORDER).map(
    ({ id, count }) => `${CITY_DISTRICTS.find((d) => d.id === id)!.name} ${count}`,
  );
  return (
    <div
      data-testid="approval-beacon-status"
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
    >
      <span
        className={
          state.status === "unavailable"
            ? "text-destructive"
            : state.total > 0
              ? "font-medium text-gold"
              : "text-muted-foreground"
        }
      >
        {approvalBeaconLabel(state)}
        {places.length ? ` · ${places.join(", ")}` : ""}
      </span>
      {state.status === "ok" && state.total > 0 ? (
        <button
          type="button"
          onClick={open}
          className="inline-flex min-h-11 items-center underline"
        >
          Open approvals inbox
        </button>
      ) : null}
      <Link to="/admin/approvals" className="inline-flex min-h-11 items-center underline">
        Approvals page
      </Link>
    </div>
  );
}
