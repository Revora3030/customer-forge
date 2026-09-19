import { useEffect, useState } from "react";
import { BellRing, CalendarCheck, MessageSquare, Star } from "lucide-react";
import { MetricCard, Pill } from "@/components/app/Bits";

const BARS = [22, 34, 28, 46, 52, 41, 64, 58, 72, 66, 84, 100];

const ACTIVITY = [
  { icon: MessageSquare, text: "Quote answered in 41s — pressure washing" },
  { icon: CalendarCheck, text: "Job booked — Tue 9:00 AM, confirmed instantly" },
  { icon: Star, text: "Review request delivered — after-job follow-up" },
  { icon: BellRing, text: "3 quiet leads nudged with a second-chance offer" },
] as const;

/** The system never sleeps — this strip quietly cycles real work it just did. */
function ActivityTicker() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % ACTIVITY.length), 3200);
    return () => window.clearInterval(timer);
  }, []);

  const Current = ACTIVITY[index] ?? ACTIVITY[0]!;

  return (
    <div
      aria-hidden="true"
      className="flex items-center gap-2.5 border-t border-border bg-elevated/60 px-3.5 py-2.5"
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>
      <Current.icon className="size-3.5 shrink-0 text-primary" />
      <span key={index} className="reveal truncate text-[11.5px] text-muted-foreground">
        {Current.text}
      </span>
    </div>
  );
}

/** Static, honest product preview: real dashboard chrome, clearly labelled demo. */
export function DashboardPreview() {
  return (
    <div className="panel dashboard-preview-shell shadow-lift overflow-hidden p-0" aria-label="Product preview">
      <div className="dashboard-preview-topbar flex items-center justify-between border-b border-border bg-elevated px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="dashboard-window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="eyebrow">Business Command Center</span>
        </div>
        <Pill tone="signal">Demo data</Pill>
      </div>

      <div className="space-y-2.5 p-3.5">
        <div className="panel-inset p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">New leads · this week</p>
              <p className="tnum mt-1 font-display text-[38px] leading-none font-semibold">42</p>
              <p className="mt-2 text-xs text-primary">▲ 18% vs last week</p>
            </div>
            <div className="text-right">
              <p className="eyebrow">Value</p>
              <p className="tnum font-display text-[15px] font-semibold">$8,420</p>
              <div className="mt-2 flex h-8 items-end justify-end gap-[3px]" aria-hidden="true">
                {[8, 12, 10, 16, 20, 32].map((h, i) => (
                  <span
                    key={i}
                    className={`grow-bar w-1.5 rounded-sm ${i > 3 ? "bg-primary" : i > 2 ? "bg-primary/60" : "bg-border"}`}
                    style={{ height: h, animationDelay: `${420 + i * 60}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <MetricCard label="Bookings" value="16" hint="3 today" tone="signal" />
          <MetricCard label="Conversion" value="6.8%" hint="visitor → lead" tone="attention" />
          <MetricCard label="Follow-up" value="5" hint="need attention" tone="attention" />
          <MetricCard label="Traffic" value="1,240" hint="visitors" />
        </div>

        <div className="panel-inset p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <span className="eyebrow">Leads over time</span>
            <span className="tnum text-[11px] text-muted-foreground">12 wks</span>
          </div>
          <div className="flex h-20 items-end gap-1.5" aria-hidden="true">
            {BARS.map((h, i) => (
              <div
                key={i}
                className={`grow-bar flex-1 rounded-sm ${i === BARS.length - 1 ? "bg-primary" : "bg-primary/35"}`}
                style={{ height: `${h}%`, animationDelay: `${520 + i * 45}ms` }}
              />
            ))}
          </div>
        </div>

        <div className="-mx-3.5 overflow-x-auto px-3.5">
          <div className="flex w-max gap-2.5">
            {[
              {
                label: "New",
                count: 9,
                tone: "neutral" as const,
                rows: [
                  ["Marcus Bell", "Interior Detail"],
                  ["Dana Reyes", "Quote request"],
                ],
              },
              {
                label: "Qualified",
                count: 4,
                tone: "signal" as const,
                rows: [
                  ["Priya Nair", "Fleet · 3 vans"],
                  ["Tom Okafor", "Paint correction"],
                ],
              },
              {
                label: "Booked",
                count: 6,
                tone: "neutral" as const,
                rows: [["Sofia Lin", "Tomorrow 9:00a"]],
              },
            ].map((col) => (
              <div
                key={col.label}
                className={`w-[136px] shrink-0 rounded-md border p-3 ${col.tone === "signal" ? "border-primary/30 bg-card" : "border-border bg-card"}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] tracking-wider uppercase ${col.tone === "signal" ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {col.label}
                  </span>
                  <span className="tnum rounded-full bg-elevated px-1.5 py-0.5 text-[10px] font-semibold">
                    {col.count}
                  </span>
                </div>
                <div className="mt-2.5 space-y-2">
                  {col.rows.map(([name, meta]) => (
                    <div key={name} className="panel-inset p-2">
                      <p className="text-xs font-medium">{name}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{meta}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 rounded-lg border border-accent/25 bg-accent/5 p-3.5">
          <div
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-md bg-accent/15 text-accent"
          >
            ◆
          </div>
          <div>
            <p className="font-display text-xs font-semibold">5 leads haven't been contacted</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Oldest is 6h old. Replying inside an hour is what turns quotes into bookings.
            </p>
          </div>
        </div>
      </div>

      <ActivityTicker />
    </div>
  );
}
