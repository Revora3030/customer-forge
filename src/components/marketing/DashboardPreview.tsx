import { BellRing, CalendarCheck, MessageSquare, Star } from "lucide-react";
import { MetricCard, Pill } from "@/components/app/Bits";

const BARS = [22, 34, 28, 46, 52, 41, 64, 58, 72, 66, 84, 100];

const ACTIVITY = [
  { icon: MessageSquare, text: "Quote answered in 41s — pressure washing" },
  { icon: CalendarCheck, text: "Job booked — Tue 9:00 AM, confirmed instantly" },
  { icon: Star, text: "Review request delivered — after-job follow-up" },
  { icon: BellRing, text: "3 quiet leads nudged with a second-chance offer" },
] as const;

/** Static examples, not recent customer activity or live delivery evidence. */
function ActivityExamples() {
  return (
    <div className="border-t border-border bg-elevated/60 px-3.5 py-3">
      <p className="eyebrow">Example workflow activity</p>
      <ul className="mt-2 space-y-2" aria-label="Illustrative automation examples">
        {ACTIVITY.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
            <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Static product illustration: sample metrics and contacts are not customer results. */
export function DashboardPreview() {
  return (
    <div
      className="panel dashboard-preview-shell shadow-lift overflow-hidden p-0"
      role="group"
      aria-label="Illustrative dashboard preview with sample data"
      data-testid="sample-dashboard-preview"
    >
      <div className="dashboard-preview-topbar flex items-center justify-between gap-2 border-b border-border bg-elevated px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="dashboard-window-dots shrink-0" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="eyebrow">Business Command Center</span>
        </div>
        <Pill tone="signal">Sample data</Pill>
      </div>
      <p className="border-b border-border bg-primary/5 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
        Illustrative preview — metrics, contacts and activity are sample data, not live customer
        results. This preview does not send messages, create bookings or process payments.
      </p>

      <div className="space-y-2.5 p-3.5">
        <div className="panel-inset p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">New leads · sample week</p>
              <p className="tnum mt-1 font-display text-[38px] leading-none font-semibold">42</p>
              <p className="mt-2 text-xs text-primary">▲ 18% · illustrative comparison</p>
            </div>
            <div className="text-right">
              <p className="eyebrow">Sample value</p>
              <p className="tnum font-display text-[15px] font-semibold">$8,420</p>
              <div className="mt-2 flex h-8 items-end justify-end gap-[3px]" aria-hidden="true">
                {[8, 12, 10, 16, 20, 32].map((h, i) => (
                  <span
                    key={i}
                    className={`grow-bar motion-reduce:animate-none w-1.5 rounded-sm ${i > 3 ? "bg-primary" : i > 2 ? "bg-primary/60" : "bg-border"}`}
                    style={{ height: h, animationDelay: `${420 + i * 60}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <MetricCard label="Bookings" value="16" hint="sample count" tone="signal" />
          <MetricCard label="Conversion" value="6.8%" hint="sample visitor → lead" tone="attention" />
          <MetricCard label="Follow-up" value="5" hint="sample pending leads" tone="attention" />
          <MetricCard label="Traffic" value="1,240" hint="sample visitors" />
        </div>

        <div className="panel-inset p-3.5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="eyebrow">Illustrative lead trend</span>
            <span className="tnum text-[11px] text-muted-foreground">12 sample weeks</span>
          </div>
          <div className="flex h-20 items-end gap-1.5" aria-hidden="true">
            {BARS.map((h, i) => (
              <div
                key={i}
                className={`grow-bar motion-reduce:animate-none flex-1 rounded-sm ${i === BARS.length - 1 ? "bg-primary" : "bg-primary/35"}`}
                style={{ height: `${h}%`, animationDelay: `${520 + i * 45}ms` }}
              />
            ))}
          </div>
        </div>

        <div
          className="-mx-3.5 overflow-x-auto px-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          role="region"
          aria-label="Sample lead pipeline; scroll horizontally to view all stages"
          tabIndex={0}
        >
          <div className="flex w-max gap-2.5">
            {[
              {
                label: "New",
                count: 9,
                tone: "neutral" as const,
                rows: [
                  ["Sample contact 1", "Interior Detail"],
                  ["Sample contact 2", "Quote request"],
                ],
              },
              {
                label: "Qualified",
                count: 4,
                tone: "signal" as const,
                rows: [
                  ["Sample contact 3", "Fleet · 3 vans"],
                  ["Sample contact 4", "Paint correction"],
                ],
              },
              {
                label: "Booked",
                count: 6,
                tone: "neutral" as const,
                rows: [["Sample contact 5", "Example: Tue 9:00a"]],
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
            <p className="font-display text-xs font-semibold">Example alert: 5 leads need a reply</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              The dashboard can help you identify pending follow-ups. These figures illustrate the interface.
            </p>
          </div>
        </div>
      </div>

      <ActivityExamples />
    </div>
  );
}
