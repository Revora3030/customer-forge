import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { EmptyState, LoadingRows, MetricCard, PageHead, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useAppointments,
  useCreateAppointment,
  useSaveAppointment,
  useServices,
} from "@/lib/queries";
import { useWorkspace } from "@/lib/use-tenant";
import { appointmentStatusMeta, type AppointmentStatus } from "@/lib/domain";
import { currency, dateLong, timeShort } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Revora" },
      { name: "description", content: "Confirm, reschedule and complete every booking." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CalendarPage,
});

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

function CalendarPage() {
  const { data: ws } = useWorkspace();
  const orgId = ws?.workspace?.organizationId;
  const businessName = ws?.workspace?.organization?.name ?? null;
  const { data: appointments, isLoading } = useAppointments(orgId);
  const { data: services } = useServices(orgId);
  const saveAppointment = useSaveAppointment(orgId, businessName);
  const createAppointment = useCreateAppointment(orgId, businessName);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [addOpen, setAddOpen] = useState(false);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + i);
        return date;
      }),
    [weekStart],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, NonNullable<typeof appointments>>();
    for (const appt of appointments ?? []) {
      const key = new Date(appt.starts_at).toDateString();
      map.set(key, [...(map.get(key) ?? []), appt]);
    }
    return map;
  }, [appointments]);

  const all = appointments ?? [];
  const pending = all.filter((a) => a.status === "pending");
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
  const thisWeek = all.filter((a) => {
    const t = new Date(a.starts_at).getTime();
    return t >= weekStart.getTime() && t < weekEnd.getTime() && a.status !== "cancelled";
  });
  const serviceName = (id: string | null) =>
    (services ?? []).find((s) => s.id === id)?.name ?? null;
  const servicePrice = (id: string | null) => {
    const service = (services ?? []).find((s) => s.id === id);
    return Number(service?.price ?? service?.starting_price ?? 0);
  };
  const weekValue = thisWeek.reduce((sum, a) => sum + servicePrice(a.service_id), 0);
  const rescheduling = all.find((a) => a.id === rescheduleId) ?? null;

  if (isLoading) return <LoadingRows rows={5} />;

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Bookings" title="Calendar" purpose="Every appointment your site takes, in one place.">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous week"
            onClick={() => {
              const next = new Date(weekStart);
              next.setDate(next.getDate() - 7);
              setWeekStart(next);
            }}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            This week
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            onClick={() => {
              const next = new Date(weekStart);
              next.setDate(next.getDate() + 7);
              setWeekStart(next);
            }}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button variant="signal">
                <Plus className="size-4" /> New booking
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Book a job</DialogTitle>
                <DialogDescription>
                  Creates the appointment plus a matching lead so your numbers stay accurate.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  const serviceId = String(form.get("service") ?? "") || null;
                  const service = (services ?? []).find((s) => s.id === serviceId);
                  createAppointment.mutate(
                    {
                      name: String(form.get("name") ?? ""),
                      email: String(form.get("email") ?? "") || null,
                      phone: String(form.get("phone") ?? "") || null,
                      serviceId,
                      startsAt: `${String(form.get("date"))}T${String(form.get("time"))}`,
                      durationMinutes: service?.duration_minutes ?? 60,
                      notes: String(form.get("notes") ?? "") || null,
                      estimatedValue: servicePrice(serviceId),
                    },
                    { onSuccess: () => setAddOpen(false) },
                  );
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="a-name">Customer name</Label>
                  <Input id="a-name" name="name" required />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="a-phone">Phone</Label>
                    <Input id="a-phone" name="phone" inputMode="tel" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="a-email">Email</Label>
                    <Input id="a-email" name="email" type="email" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="a-date">Date</Label>
                    <Input id="a-date" name="date" type="date" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="a-time">Time</Label>
                    <Input id="a-time" name="time" type="time" required defaultValue="09:00" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="a-service">Service</Label>
                  <select
                    id="a-service"
                    name="service"
                    className="h-10 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">No specific service</option>
                    {(services ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.duration_minutes}min
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="a-notes">Notes</Label>
                  <Textarea id="a-notes" name="notes" rows={2} />
                </div>
                <DialogFooter>
                  <Button type="submit" variant="signal" disabled={createAppointment.isPending}>
                    Add booking
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </PageHead>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Jobs this week" value={String(thisWeek.length)} tone="signal" />
        <MetricCard
          label="Awaiting confirmation"
          value={String(pending.length)}
          tone={pending.length ? "attention" : "neutral"}
        />
        <MetricCard
          label="Booked value this week"
          value={currency(weekValue)}
          hint="based on service pricing"
        />
        <MetricCard
          label="Completed all time"
          value={String(all.filter((a) => a.status === "completed").length)}
        />
      </div>

      {pending.length ? (
        <Panel className="border-accent/30 p-5">
          <SectionHeading
            eyebrow="Needs your answer"
            title={`${pending.length} booking request${pending.length > 1 ? "s" : ""}`}
          />
          <ul className="mt-4 divide-y divide-border">
            {pending.map((appt) => (
              <li key={appt.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{appt.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {dateLong(appt.starts_at)} · {timeShort(appt.starts_at)}
                    {serviceName(appt.service_id) ? ` · ${serviceName(appt.service_id)}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="signal"
                    size="sm"
                    onClick={() =>
                      saveAppointment.mutate({ appointment: appt, patch: { status: "confirmed" } })
                    }
                  >
                    Confirm
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setRescheduleId(appt.id)}>
                    Reschedule
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      saveAppointment.mutate({ appointment: appt, patch: { status: "cancelled" } })
                    }
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="-mx-4 overflow-x-auto px-4">
        <div className="grid w-max min-w-full grid-cols-7 gap-2">
          {days.map((day, index) => {
            const isToday = day.toDateString() === new Date().toDateString();
            const items = byDay.get(day.toDateString()) ?? [];
            return (
              <section
                key={day.toISOString()}
                className={cn(
                  "w-40 rounded-lg border p-2.5",
                  isToday ? "border-primary/40 bg-card" : "border-border bg-card",
                )}
              >
                <p className={cn("eyebrow", isToday && "text-primary")}>{DAY_LABELS[index]}</p>
                <p className="tnum mt-0.5 font-display text-[15px] font-semibold">
                  {day.getDate()}
                </p>
                <div className="mt-2.5 space-y-1.5">
                  {items.map((appt) => (
                    <div key={appt.id} className="panel-inset p-2">
                      <p className="tnum text-[11px] text-primary">{timeShort(appt.starts_at)}</p>
                      <p className="mt-0.5 truncate text-[12px] font-medium">{appt.name}</p>
                      <p className="mt-1">
                        <Pill tone={appointmentStatusMeta(appt.status).tone}>
                          {appointmentStatusMeta(appt.status).label}
                        </Pill>
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {appt.status === "pending" ? (
                          <button
                            type="button"
                            className="cursor-pointer text-[11px] text-primary hover:underline"
                            onClick={() =>
                              saveAppointment.mutate({
                                appointment: appt,
                                patch: { status: "confirmed" },
                              })
                            }
                          >
                            Confirm
                          </button>
                        ) : null}
                        {appt.status === "confirmed" ? (
                          <button
                            type="button"
                            className="cursor-pointer text-[11px] text-primary hover:underline"
                            onClick={() =>
                              saveAppointment.mutate({
                                appointment: appt,
                                patch: { status: "completed" },
                              })
                            }
                          >
                            Mark done
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="cursor-pointer text-[11px] text-muted-foreground hover:underline"
                          onClick={() => setRescheduleId(appt.id)}
                        >
                          Move
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <Panel className="p-5">
        <SectionHeading eyebrow="All bookings" title="Upcoming and past" />
        {all.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No bookings yet"
              description="When customers book from your website, the appointment shows up here for you to confirm."
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {all.map((appt) => (
              <li
                key={appt.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{appt.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {dateLong(appt.starts_at)} · {timeShort(appt.starts_at)}
                    {appt.phone ? ` · ${appt.phone}` : ""}
                    {serviceName(appt.service_id) ? ` · ${serviceName(appt.service_id)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={appointmentStatusMeta(appt.status).tone}>
                    {appointmentStatusMeta(appt.status).label}
                  </Pill>
                  <select
                    aria-label={`Status for ${appt.name}`}
                    value={appt.status}
                    onChange={(e) =>
                      saveAppointment.mutate({
                        appointment: appt,
                        patch: { status: e.target.value as AppointmentStatus },
                      })
                    }
                    className="h-8 cursor-pointer rounded-md border border-input bg-background px-2 text-[12px]"
                  >
                    {["pending", "confirmed", "completed", "cancelled", "no_show"].map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                  <Button variant="ghost" size="sm" onClick={() => setRescheduleId(appt.id)}>
                    Reschedule
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Dialog open={!!rescheduling} onOpenChange={(open) => !open && setRescheduleId(null)}>
        <DialogContent>
          {rescheduling ? (
            <>
              <DialogHeader>
                <DialogTitle>Reschedule {rescheduling.name}</DialogTitle>
                <DialogDescription>
                  Currently {dateLong(rescheduling.starts_at)} at{" "}
                  {timeShort(rescheduling.starts_at)}.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  const starts = new Date(
                    `${String(form.get("date"))}T${String(form.get("time"))}`,
                  );
                  const duration =
                    (new Date(rescheduling.ends_at ?? rescheduling.starts_at).getTime() -
                      new Date(rescheduling.starts_at).getTime()) /
                      60_000 || 60;
                  saveAppointment.mutate(
                    {
                      appointment: rescheduling,
                      patch: {
                        starts_at: starts.toISOString(),
                        ends_at: new Date(starts.getTime() + duration * 60_000).toISOString(),
                      },
                    },
                    { onSuccess: () => setRescheduleId(null) },
                  );
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="r-date">New date</Label>
                    <Input
                      id="r-date"
                      name="date"
                      type="date"
                      required
                      defaultValue={rescheduling.starts_at.slice(0, 10)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="r-time">New time</Label>
                    <Input
                      id="r-time"
                      name="time"
                      type="time"
                      required
                      defaultValue={new Date(rescheduling.starts_at).toTimeString().slice(0, 5)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" variant="signal" disabled={saveAppointment.isPending}>
                    Move booking
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
