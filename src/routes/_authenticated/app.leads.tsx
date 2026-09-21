import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CalendarPlus,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Search,
  StickyNote,
  UserCheck,
} from "lucide-react";
import { EmptyState, LoadingRows, PageHead, Panel, Pill, SectionHeading } from "@/components/app/Bits";
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
  useConvertLeadToCustomer,
  useCreateAppointment,
  useCreateLead,
  useLeadAction,
  useLeadActivities,
  useLeads,
  useServices,
  useTeam,
} from "@/lib/queries";
import { useWorkspace } from "@/lib/use-tenant";
import { LEAD_STATUSES, leadStatusMeta, sourceLabel, type LeadStatus } from "@/lib/domain";
import { currency, relative } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/leads")({
  head: () => ({
    meta: [
      { title: "Lead pipeline — Revora" },
      {
        name: "description",
        content: "Work every lead from new to booked with calls, texts and follow-ups.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LeadsPage,
});

const FOLLOW_UPS = [
  { label: "Tomorrow", days: 1 },
  { label: "In 2 days", days: 2 },
  { label: "In 1 week", days: 7 },
];

function LeadsPage() {
  const { data: ws } = useWorkspace();
  const orgId = ws?.workspace?.organizationId;
  const businessName = ws?.workspace?.organization?.name ?? null;
  const { data: leads, isLoading } = useLeads(orgId);
  const { data: team } = useTeam(orgId);
  const { data: services } = useServices(orgId);
  const action = useLeadAction(orgId, businessName);
  const createLead = useCreateLead(orgId);
  const convert = useConvertLeadToCustomer(orgId);
  const createAppointment = useCreateAppointment(orgId, businessName);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [bookOpen, setBookOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (leads ?? []).filter((lead) => {
      const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
      const matchesQuery =
        !q ||
        [lead.name, lead.email, lead.phone, lead.service_interest, lead.city]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q));
      return matchesStatus && matchesQuery;
    });
  }, [leads, query, statusFilter]);

  const selected = (leads ?? []).find((l) => l.id === selectedId) ?? null;
  const { data: activities } = useLeadActivities(orgId, selectedId);

  const leadRef = selected
    ? {
        id: selected.id,
        name: selected.name,
        email: selected.email,
        phone: selected.phone,
        service_interest: selected.service_interest,
        estimated_value: Number(selected.estimated_value ?? 0),
      }
    : null;

  const triggerFor = (status: LeadStatus) =>
    status === "quoted" ? "quote_requested" : status === "booked" ? "booking_created" : undefined;

  if (isLoading) return <LoadingRows rows={6} />;

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Pipeline" title="Leads" purpose="Everyone who enquired, and where each one stands.">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button variant="signal">
              <Plus className="size-4" /> Add lead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a lead</DialogTitle>
              <DialogDescription>
                For the calls and walk-ups that didn't come through your website.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                createLead.mutate(
                  {
                    name: String(form.get("name") ?? ""),
                    email: String(form.get("email") ?? "") || undefined,
                    phone: String(form.get("phone") ?? "") || undefined,
                    service_interest: String(form.get("service") ?? "") || undefined,
                    estimated_value: Number(form.get("value") ?? 0) || 0,
                    message: String(form.get("message") ?? "") || undefined,
                    source: "manual",
                  },
                  { onSuccess: () => setAddOpen(false) },
                );
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="l-name">Name</Label>
                <Input id="l-name" name="name" required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="l-phone">Phone</Label>
                  <Input id="l-phone" name="phone" inputMode="tel" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="l-email">Email</Label>
                  <Input id="l-email" name="email" type="email" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="l-service">Interested in</Label>
                  <Input id="l-service" name="service" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="l-value">Job value ($)</Label>
                  <Input id="l-value" name="value" inputMode="decimal" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="l-message">Notes</Label>
                <Textarea id="l-message" name="message" rows={3} />
              </div>
              <DialogFooter>
                <Button type="submit" variant="signal" disabled={createLead.isPending}>
                  Add lead
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </PageHead>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone, service…"
            className="pl-9"
            aria-label="Search leads"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`cursor-pointer rounded-full border px-3 py-1 text-[12px] ${statusFilter === "all" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
          >
            All
          </button>
          {LEAD_STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatusFilter(s.value)}
              className={`cursor-pointer rounded-full border px-3 py-1 text-[12px] ${statusFilter === s.value ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Board — only shown once there is at least one real lead, so a new
          account sees one clear next step instead of seven empty columns. */}
      {(leads ?? []).length > 0 ? (
        <div className="-mx-4 overflow-x-auto px-4">
          <div className="flex w-max gap-3">
            {LEAD_STATUSES.map((status) => {
              const column = filtered.filter((l) => l.status === status.value);
              const value = column.reduce((sum, l) => sum + Number(l.estimated_value ?? 0), 0);
              return (
                <section key={status.value} className="w-64 shrink-0">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="eyebrow">{status.label}</span>
                    <span className="tnum rounded-full bg-elevated px-1.5 py-0.5 text-[10px] font-semibold">
                      {column.length} · {currency(value)}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {column.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(lead.id);
                          setNote("");
                        }}
                        className="panel w-full cursor-pointer p-3 text-left transition-colors hover:border-muted-foreground/40"
                      >
                        <p className="truncate text-[13px] font-medium">{lead.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {[lead.service_interest, sourceLabel(lead.source)]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="tnum text-[11px] text-muted-foreground">
                            {currency(Number(lead.estimated_value ?? 0))}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {relative(lead.created_at)}
                          </span>
                        </div>
                        {lead.next_follow_up_at ? (
                          <p className="mt-1.5 text-[10px] text-accent">
                            Follow up {relative(lead.next_follow_up_at)}
                          </p>
                        ) : null}
                      </button>
                    ))}
                    {column.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-[11px] text-muted-foreground">
                        Nothing here
                      </p>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState
          title="No leads yet"
          description="Leads from your website, quote calculator and booking form all land here automatically. You can also add one yourself with “Add lead”."
        />
      )}

      {(leads ?? []).length > 0 && filtered.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          No leads match what you searched for. Clear the search or choose “All” to see everyone
          again.
        </p>
      ) : null}

      {/* Detail */}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {selected && leadRef ? (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>
                  {[sourceLabel(selected.source), selected.city, relative(selected.created_at)]
                    .filter(Boolean)
                    .join(" · ")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  {selected.phone ? (
                    <>
                      <Button
                        asChild
                        variant="signal"
                        size="sm"
                        onClick={() =>
                          action.mutate({
                            lead: leadRef,
                            patch: {
                              last_contacted_at: new Date().toISOString(),
                              status: selected.status === "new" ? "contacted" : selected.status,
                            },
                            activity: { kind: "call", body: `Called ${selected.phone}` },
                          })
                        }
                      >
                        <a href={`tel:${selected.phone}`}>
                          <Phone className="size-4" /> Call
                        </a>
                      </Button>
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          action.mutate({
                            lead: leadRef,
                            patch: { last_contacted_at: new Date().toISOString() },
                            activity: { kind: "text", body: `Texted ${selected.phone}` },
                          })
                        }
                      >
                        <a href={`sms:${selected.phone}`}>
                          <MessageSquare className="size-4" /> Text
                        </a>
                      </Button>
                    </>
                  ) : null}
                  {selected.email ? (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        action.mutate({
                          lead: leadRef,
                          patch: { last_contacted_at: new Date().toISOString() },
                          activity: { kind: "email", body: `Emailed ${selected.email}` },
                        })
                      }
                    >
                      <a href={`mailto:${selected.email}`}>
                        <Mail className="size-4" /> Email
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBookOpen(true)}
                    disabled={createAppointment.isPending}
                  >
                    <CalendarPlus className="size-4" /> Book job
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={convert.isPending || !!selected.customer_id}
                    onClick={() => convert.mutate(leadRef)}
                  >
                    <UserCheck className="size-4" />
                    {selected.customer_id ? "Already a customer" : "Convert to customer"}
                  </Button>
                </div>

                {selected.message ? (
                  <Panel className="p-3.5">
                    <p className="eyebrow">What they said</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed">{selected.message}</p>
                  </Panel>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="d-status">Stage</Label>
                    <select
                      id="d-status"
                      value={selected.status}
                      onChange={(e) => {
                        const next = e.target.value as LeadStatus;
                        action.mutate({
                          lead: leadRef,
                          patch: { status: next },
                          activity: {
                            kind: "status",
                            body: `Stage moved to ${leadStatusMeta(next).label}.`,
                          },
                          ...(triggerFor(next) ? { trigger: triggerFor(next)! } : {}),
                        });
                      }}
                      className="h-10 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {LEAD_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="d-value">Job value ($)</Label>
                    <Input
                      id="d-value"
                      defaultValue={String(selected.estimated_value ?? "")}
                      inputMode="decimal"
                      onBlur={(e) =>
                        action.mutate({
                          lead: leadRef,
                          patch: { estimated_value: Number(e.target.value) || 0 },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="d-assign">Assigned to</Label>
                    <select
                      id="d-assign"
                      value={selected.assigned_to ?? ""}
                      onChange={(e) => {
                        const userId = e.target.value || null;
                        const member = (team ?? []).find((m) => m.user_id === userId);
                        action.mutate({
                          lead: leadRef,
                          patch: { assigned_to: userId },
                          activity: {
                            kind: "assign",
                            body: userId
                              ? `Assigned to ${(member?.profiles as { full_name?: string; email?: string } | null)?.full_name ?? (member?.profiles as { email?: string } | null)?.email ?? "a teammate"}.`
                              : "Unassigned.",
                          },
                        });
                      }}
                      className="h-10 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Unassigned</option>
                      {(team ?? []).map((member) => {
                        const profile = member.profiles as {
                          full_name?: string | null;
                          email?: string | null;
                        } | null;
                        return (
                          <option key={member.id} value={member.user_id}>
                            {profile?.full_name || profile?.email || member.role}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="d-followup">Next follow-up</Label>
                    <Input
                      id="d-followup"
                      type="date"
                      value={selected.next_follow_up_at?.slice(0, 10) ?? ""}
                      onChange={(e) =>
                        action.mutate({
                          lead: leadRef,
                          patch: {
                            next_follow_up_at: e.target.value
                              ? new Date(`${e.target.value}T09:00:00`).toISOString()
                              : null,
                          },
                          activity: {
                            kind: "follow_up",
                            body: e.target.value
                              ? `Follow-up scheduled for ${e.target.value}.`
                              : "Follow-up cleared.",
                          },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={leadStatusMeta(selected.status).tone}>
                    {leadStatusMeta(selected.status).label}
                  </Pill>
                  {FOLLOW_UPS.map((f) => (
                    <Button
                      key={f.label}
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        action.mutate({
                          lead: leadRef,
                          patch: {
                            next_follow_up_at: new Date(
                              Date.now() + f.days * 86_400_000,
                            ).toISOString(),
                          },
                          activity: {
                            kind: "follow_up",
                            body: `Follow-up set ${f.label.toLowerCase()}.`,
                          },
                        })
                      }
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="d-note">Add a note</Label>
                  <Textarea
                    id="d-note"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Quoted $320 over the phone, wants Saturday…"
                  />
                  <Button
                    size="sm"
                    variant="signal"
                    disabled={!note.trim() || action.isPending}
                    onClick={() =>
                      action.mutate(
                        { lead: leadRef, activity: { kind: "note", body: note.trim() } },
                        { onSuccess: () => setNote("") },
                      )
                    }
                  >
                    <StickyNote className="size-4" /> Save note
                  </Button>
                </div>

                <div>
                  <p className="eyebrow">Activity</p>
                  <ul className="mt-2 space-y-2">
                    {(activities ?? []).map((item) => (
                      <li key={item.id} className="flex gap-2.5 text-[12px]">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                        <span>
                          <span className="font-medium">{item.kind.replace(/_/g, " ")}</span>
                          {item.body ? ` — ${item.body}` : ""}
                          <span className="ml-1 text-muted-foreground">
                            {relative(item.created_at)}
                          </span>
                        </span>
                      </li>
                    ))}
                    {(activities ?? []).length === 0 ? (
                      <li className="text-[12px] text-muted-foreground">
                        Nothing logged yet. Calls, texts, notes and automations show up here.
                      </li>
                    ) : null}
                  </ul>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Book a job for this lead */}
      <Dialog open={bookOpen} onOpenChange={setBookOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Book {selected?.name}</DialogTitle>
            <DialogDescription>
              This lands on your calendar and moves the lead to Booked.
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const serviceId = String(form.get("service") ?? "") || null;
                const service = (services ?? []).find((s) => s.id === serviceId);
                createAppointment.mutate(
                  {
                    name: selected.name,
                    email: selected.email,
                    phone: selected.phone,
                    leadId: selected.id,
                    serviceId,
                    startsAt: `${String(form.get("date"))}T${String(form.get("time"))}`,
                    durationMinutes: service?.duration_minutes ?? 60,
                    notes: String(form.get("notes") ?? "") || null,
                  },
                  { onSuccess: () => setBookOpen(false) },
                );
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="b-date">Date</Label>
                  <Input id="b-date" name="date" type="date" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="b-time">Time</Label>
                  <Input id="b-time" name="time" type="time" required defaultValue="09:00" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-service">Service</Label>
                <select
                  id="b-service"
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
                <Label htmlFor="b-notes">Notes</Label>
                <Textarea id="b-notes" name="notes" rows={2} />
              </div>
              <DialogFooter>
                <Button type="submit" variant="signal" disabled={createAppointment.isPending}>
                  Add to calendar
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Panel className="p-5">
        <SectionHeading eyebrow="Reference" title="How the pipeline works" />
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          New leads arrive on the left. Call, text or email from the lead card and it logs itself.
          Moving a lead to Quoted or Booked fires the matching automation, and booking a job puts it
          straight on your calendar and into your dashboard numbers.
        </p>
      </Panel>
    </div>
  );
}
