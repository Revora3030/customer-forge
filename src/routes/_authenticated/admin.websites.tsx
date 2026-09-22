import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { EmptyState, LoadingRows, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateWebsiteRequest } from "@/lib/queries";
import { REQUEST_STATUSES, requestStatusMeta } from "@/lib/website-plan";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/websites")({
  head: () => ({
    meta: [
      { title: "Website queue — Revora admin" },
      {
        name: "description",
        content: "Quality control and change requests for every client website.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminWebsites,
});

function useAllRequests() {
  return useQuery({
    queryKey: ["website_requests", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_requests")
        .select("*, organizations(name, slug)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useWebsiteStates() {
  return useQuery({
    queryKey: ["admin_website_states"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_settings")
        .select(
          "organization_id, review_state, publish_state, generated_at, organizations(name, slug)",
        )
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

const FILTERS = [
  { value: "open", label: "Open" },
  ...REQUEST_STATUSES,
  { value: "all", label: "All" },
];

function AdminWebsites() {
  const requests = useAllRequests();
  const states = useWebsiteStates();
  const update = useUpdateWebsiteRequest();
  const [filter, setFilter] = useState("open");
  const [notesFor, setNotesFor] = useState<string | null>(null);

  const rows = (requests.data ?? []).filter((r) => {
    const status = String(r.status);
    if (filter === "all") return true;
    if (filter === "open") return status !== "completed";
    return status === filter;
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Quality control</p>
        <h1 className="mt-1 font-display text-[24px] font-semibold">Website queue</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Every client website state and change request in one place.
        </p>
      </div>

      <Panel className="p-5">
        <SectionHeading eyebrow="Client websites" title="Review states" />
        {states.isLoading ? (
          <LoadingRows rows={4} />
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {(states.data ?? []).map((s) => {
              const org = s.organizations as { name?: string; slug?: string } | null;
              return (
                <li
                  key={s.organization_id as string}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-[13px] font-medium">{org?.name ?? "Client"}</p>
                    <p className="text-[12px] text-muted-foreground">
                      /s/{org?.slug} · publish: {String(s.publish_state)}
                    </p>
                  </div>
                  <Pill tone="neutral">{String(s.review_state ?? "onboarding")}</Pill>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading eyebrow="Change requests" title={`${rows.length} in view`} />
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  "cursor-pointer rounded-md px-2.5 py-1.5 text-[12px]",
                  filter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-elevated",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {requests.isLoading ? (
          <LoadingRows rows={4} />
        ) : rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<ClipboardList className="size-5" />}
              title="Nothing in the queue"
              description="Client change requests will appear here as soon as they're submitted."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {rows.map((r) => {
              const org = r.organizations as { name?: string; slug?: string } | null;
              const meta = requestStatusMeta(String(r.status));
              const id = String(r.id);
              return (
                <li key={id} className="product-tile">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-medium">{String(r.title)}</p>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {org?.name ?? "Client"} · {String(r.kind)} · priority {String(r.priority)}
                      </p>
                      {r.details ? (
                        <p className="mt-2 text-[12px] text-muted-foreground">
                          {String(r.details)}
                        </p>
                      ) : null}
                      {r.admin_notes ? (
                        <p className="mt-2 text-[12px] text-primary">
                          Note: {String(r.admin_notes)}
                        </p>
                      ) : null}
                    </div>
                    <Pill tone={meta.tone}>{meta.label}</Pill>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {REQUEST_STATUSES.map((s) => (
                      <Button
                        key={s.value}
                        size="sm"
                        variant={String(r.status) === s.value ? "signal" : "outline"}
                        onClick={() => update.mutate({ id, patch: { status: s.value } })}
                      >
                        {s.label}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setNotesFor(notesFor === id ? null : id)}
                    >
                      Add note
                    </Button>
                  </div>

                  {notesFor === id ? (
                    <form
                      className="mt-3 space-y-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = new FormData(e.currentTarget);
                        update.mutate(
                          { id, patch: { admin_notes: String(form.get("note") ?? "") || null } },
                          { onSuccess: () => setNotesFor(null) },
                        );
                      }}
                    >
                      <Textarea
                        name="note"
                        rows={2}
                        defaultValue={(r.admin_notes as string) ?? ""}
                      />
                      <Button size="sm" type="submit" variant="signal">
                        Save note
                      </Button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
