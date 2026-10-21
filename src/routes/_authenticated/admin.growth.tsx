import { useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, History, Pencil, RefreshCw, X } from "lucide-react";
import { EmptyState, ErrorNote, LoadingRows, MetricCard, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as G from "@/lib/growth-engine.functions";
import { MODULE_LABEL, type ApprovalItemType } from "@/lib/growth-engine/rules";

export const Route = createFileRoute("/_authenticated/admin/growth")({
  head: () => ({
    meta: [
      { title: "Free Growth Engine — Revora admin" },
      { name: "description", content: "Jarvis drafts free growth work; you approve every action." },
      { property: "og:title", content: "Free Growth Engine — Revora admin" },
      { property: "og:description", content: "Jarvis drafts free growth work; you approve every action." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GrowthEngine,
});

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

function useAct<T>(fn: (v: T) => Promise<unknown>, keys: string[]) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      const note = r && typeof r === "object" && "note" in r ? String((r as { note: string }).note) : "Done.";
      setMsg(note);
      keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      qc.invalidateQueries({ queryKey: ["growth-overview"] });
      qc.invalidateQueries({ queryKey: ["growth-queue"] });
    },
    onError: (e) => setMsg(errText(e)),
  });
  return { ...m, msg };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Note({ msg }: { msg: string | null }) {
  return msg ? <p className="text-sm text-muted-foreground" role="status">{msg}</p> : null;
}

function GrowthEngine() {
  return (
    <div className="space-y-6">
      <SectionHeading title="Free Growth Engine" description="Jarvis drafts. You approve. Nothing goes out without your tap." />
      <Tabs defaultValue="home">
        <div className="-mx-1 overflow-x-auto pb-1">
          <TabsList className="w-max">
            {["home", "approvals", "google", "directories", "content", "reviews", "listening", "referrals", "partners", "social", "events"].map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize">{t}</TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="home"><Home /></TabsContent>
        <TabsContent value="approvals"><Approvals /></TabsContent>
        <TabsContent value="google"><Google /></TabsContent>
        <TabsContent value="directories"><Directories /></TabsContent>
        <TabsContent value="content"><Content /></TabsContent>
        <TabsContent value="reviews"><Reviews /></TabsContent>
        <TabsContent value="listening"><Listening /></TabsContent>
        <TabsContent value="referrals"><Referrals /></TabsContent>
        <TabsContent value="partners"><Partners /></TabsContent>
        <TabsContent value="social"><Social /></TabsContent>
        <TabsContent value="events"><Events /></TabsContent>
      </Tabs>
    </div>
  );
}

function Home() {
  const load = useServerFn(G.getGrowthOverview);
  const save = useServerFn(G.saveGrowthBusiness);
  const q = useQuery({ queryKey: ["growth-overview"], queryFn: () => load() });
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const act = useAct((v: Record<string, string>) => save({ data: v as never }), ["growth-overview"]);
  if (q.isLoading) return <LoadingRows />;
  if (q.error) return <ErrorNote message={errText(q.error)} />;
  const d = q.data!;
  const b = (d.business ?? {}) as Record<string, string | null>;
  const f = form ?? Object.fromEntries(["name", "niche", "city", "service_area", "address", "phone", "email", "website_url"].map((k) => [k, b[k] ?? ""]));
  return (
    <div className="space-y-6 pt-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Free-channel health" value={`${d.health}/100`} />
        <MetricCard label="Waiting for approval" value={String(d.pendingCount)} />
        <MetricCard label="Wins this week" value={String(d.winsThisWeek)} />
        <MetricCard label="Directories live" value={`${d.directoriesLive}/${d.directoriesTotal}`} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Pill tone={d.gbpConnected ? "success" : "warning"}>Google profile {d.gbpConnected ? "linked" : "not linked"}</Pill>
        <Pill tone={d.smsConnected ? "success" : "neutral"}>Texting {d.smsConnected ? "connected" : "off"}</Pill>
      </div>
      <Panel title="Next 7 days">
        {d.upcoming.length ? (
          <ul className="divide-y text-sm">
            {d.upcoming.map((u) => (
              <li key={u.id} className="flex justify-between gap-3 py-2"><span className="truncate">{u.label}</span><span className="shrink-0 text-muted-foreground">{u.kind} · {new Date(u.at).toLocaleDateString()}</span></li>
            ))}
          </ul>
        ) : <EmptyState title="Nothing scheduled" description="Drafts you create will appear here." />}
      </Panel>
      <Panel title="Your business details">
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.keys(f).map((k) => (
            <Field key={k} label={k.replace("_", " ")}>
              <Input value={f[k]} onChange={(e) => setForm({ ...f, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={() => act.mutate(f)} disabled={act.isPending || !f["name"]}>Save</Button>
          <Note msg={act.msg} />
        </div>
      </Panel>
    </div>
  );
}

function Approvals() {
  const [status, setStatus] = useState<"pending" | "approved" | "executed" | "rejected" | "failed" | "all">("pending");
  const load = useServerFn(G.listApprovals);
  const decide = useServerFn(G.decideApproval);
  const edit = useServerFn(G.editApproval);
  const hist = useServerFn(G.approvalHistory);
  const q = useQuery({ queryKey: ["growth-queue", status], queryFn: () => load({ data: { status } }) });
  const act = useAct((v: { id: string; decision: "approve" | "reject" }) => decide({ data: v }), []);
  const save = useAct((v: { id: string; preview: string }) => edit({ data: v }), []);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [history, setHistory] = useState<{ id: string; rows: { version: number; content: { preview: string }; created_at: string }[] } | null>(null);
  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap gap-2">
        {(["pending", "approved", "executed", "failed", "rejected", "all"] as const).map((s) => (
          <Button key={s} size="sm" variant={s === status ? "default" : "outline"} onClick={() => setStatus(s)} className="capitalize">{s}</Button>
        ))}
      </div>
      <Note msg={act.msg ?? save.msg} />
      {q.isLoading ? <LoadingRows /> : q.error ? <ErrorNote message={errText(q.error)} /> : !q.data?.length ? (
        <EmptyState title="Nothing here" description="New drafts from every module land in this inbox." />
      ) : (
        <ul className="space-y-3">
          {q.data.map((item) => (
            <li key={item.id}>
              <Panel title={item.summary}>
                <div className="mb-2 flex flex-wrap gap-2 text-xs">
                  <Pill tone="neutral">{MODULE_LABEL[item.item_type as ApprovalItemType] ?? item.item_type}</Pill>
                  <Pill tone={item.risk_level === "high" ? "danger" : item.risk_level === "medium" ? "warning" : "success"}>{item.risk_level} risk</Pill>
                  <Pill tone="neutral">{item.status}</Pill>
                </div>
                {editing?.id === item.id ? (
                  <Textarea rows={8} value={editing.text} onChange={(e) => setEditing({ id: item.id, text: e.target.value })} />
                ) : (
                  <p className="whitespace-pre-wrap text-sm">{item.preview}</p>
                )}
                {item.execution_note && <p className="mt-2 text-xs text-muted-foreground">{item.execution_note}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.status === "pending" && editing?.id !== item.id && (
                    <>
                      <Button size="sm" onClick={() => act.mutate({ id: item.id, decision: "approve" })} disabled={act.isPending}><Check className="mr-1 size-4" />Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => act.mutate({ id: item.id, decision: "reject" })} disabled={act.isPending}><X className="mr-1 size-4" />Reject</Button>
                    </>
                  )}
                  {editing?.id === item.id ? (
                    <>
                      <Button size="sm" onClick={() => { save.mutate({ id: item.id, preview: editing.text }); setEditing(null); }}>Save edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setEditing({ id: item.id, text: item.preview ?? "" })}><Pencil className="mr-1 size-4" />Edit</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={async () => setHistory({ id: item.id, rows: await hist({ data: { id: item.id } }) })}><History className="mr-1 size-4" />History</Button>
                </div>
                {history?.id === item.id && (
                  <ol className="mt-3 space-y-2 border-t pt-3 text-xs">
                    {history.rows.map((h) => (
                      <li key={h.version}><strong>v{h.version}</strong> · {new Date(h.created_at).toLocaleString()}<p className="whitespace-pre-wrap text-muted-foreground line-clamp-3">{h.content.preview}</p></li>
                    ))}
                  </ol>
                )}
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Google() {
  const load = useServerFn(G.getGbp);
  const audit = useServerFn(G.auditGbp);
  const post = useServerFn(G.draftGbpPost);
  const reply = useServerFn(G.draftReviewReply);
  const q = useQuery({ queryKey: ["growth-gbp"], queryFn: () => load() });
  const [a, setA] = useState({ category: "", hasHours: false, hasBookingLink: false, hasDescription: false, photosCount: 0, lastPhotoDate: "", postsCount: 0, lastPostDate: "", reviewsCount: 0, avgRating: null as number | null, profileUrl: "" });
  const [topic, setTopic] = useState("");
  const [rv, setRv] = useState({ reviewer: "", rating: 5, text: "", gbpPath: "" });
  const auditAct = useAct(() => audit({ data: a }), ["growth-gbp"]);
  const postAct = useAct(() => post({ data: { topic } }), []);
  const replyAct = useAct(() => reply({ data: rv }), []);
  const g = q.data as { optimization_score: number | null; fix_list: string[] } | null | undefined;
  return (
    <div className="space-y-4 pt-4">
      <Panel title={`Profile check-up${g?.optimization_score != null ? ` — ${g.optimization_score}/100` : ""}`}>
        {g?.fix_list?.length ? <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm">{g.fix_list.map((f) => <li key={f}>{f}</li>)}</ol> : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Primary category"><Input value={a.category} onChange={(e) => setA({ ...a, category: e.target.value })} /></Field>
          <Field label="Photos"><Input type="number" value={a.photosCount} onChange={(e) => setA({ ...a, photosCount: Number(e.target.value) })} /></Field>
          <Field label="Last photo date"><Input type="date" value={a.lastPhotoDate} onChange={(e) => setA({ ...a, lastPhotoDate: e.target.value })} /></Field>
          <Field label="Posts"><Input type="number" value={a.postsCount} onChange={(e) => setA({ ...a, postsCount: Number(e.target.value) })} /></Field>
          <Field label="Last post date"><Input type="date" value={a.lastPostDate} onChange={(e) => setA({ ...a, lastPostDate: e.target.value })} /></Field>
          <Field label="Reviews"><Input type="number" value={a.reviewsCount} onChange={(e) => setA({ ...a, reviewsCount: Number(e.target.value) })} /></Field>
          <Field label="Average rating"><Input type="number" step="0.1" value={a.avgRating ?? ""} onChange={(e) => setA({ ...a, avgRating: e.target.value ? Number(e.target.value) : null })} /></Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          {(["hasHours", "hasDescription", "hasBookingLink"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={a[k]} onChange={(e) => setA({ ...a, [k]: e.target.checked })} />{k === "hasHours" ? "Hours set" : k === "hasDescription" ? "Description set" : "Booking link"}</label>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3"><Button onClick={() => auditAct.mutate(undefined)} disabled={auditAct.isPending}>Score my profile</Button><Note msg={auditAct.msg} /></div>
      </Panel>
      <Panel title="Draft a Google post">
        <div className="flex flex-col gap-2 sm:flex-row"><Input placeholder="e.g. Fall interior detail special" value={topic} onChange={(e) => setTopic(e.target.value)} /><Button onClick={() => postAct.mutate(undefined)} disabled={postAct.isPending || topic.length < 3}>Draft</Button></div>
        <Note msg={postAct.msg} />
      </Panel>
      <Panel title="Draft a review reply">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Reviewer"><Input value={rv.reviewer} onChange={(e) => setRv({ ...rv, reviewer: e.target.value })} /></Field>
          <Field label="Stars (1–5)"><Input type="number" min={1} max={5} value={rv.rating} onChange={(e) => setRv({ ...rv, rating: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Review text"><Textarea value={rv.text} onChange={(e) => setRv({ ...rv, text: e.target.value })} /></Field>
        <div className="mt-3 flex items-center gap-3"><Button onClick={() => replyAct.mutate(undefined)} disabled={replyAct.isPending || !rv.reviewer}>Draft reply</Button><Note msg={replyAct.msg} /></div>
      </Panel>
    </div>
  );
}

function Directories() {
  const load = useServerFn(G.listDirectories);
  const build = useServerFn(G.buildDirectoryPackages);
  const update = useServerFn(G.updateDirectory);
  const q = useQuery({ queryKey: ["growth-dirs"], queryFn: () => load() });
  const buildAct = useAct(() => build(), ["growth-dirs"]);
  const upd = useAct((v: { id: string; status: "submitted" | "live" | "rejected" }) => update({ data: v }), ["growth-dirs"]);
  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center gap-3"><Button onClick={() => buildAct.mutate(undefined)} disabled={buildAct.isPending}>Build listing packages</Button><Note msg={buildAct.msg ?? upd.msg} /></div>
      {q.isLoading ? <LoadingRows /> : q.error ? <ErrorNote message={errText(q.error)} /> : !q.data?.length ? <EmptyState title="No listings yet" description="Build packages from your business details." /> : (
        <ul className="divide-y rounded-lg border">
          {q.data.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>{d.directory_name}</span>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={d.status === "live" ? "success" : d.status === "needs_update" ? "danger" : "neutral"}>{d.status.replace("_", " ")}</Pill>
                <Button size="sm" variant="outline" onClick={() => upd.mutate({ id: d.id, status: "submitted" })}>Submitted</Button>
                <Button size="sm" variant="outline" onClick={() => upd.mutate({ id: d.id, status: "live" })}>Live</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Content() {
  const load = useServerFn(G.listContent);
  const draft = useServerFn(G.draftContent);
  const q = useQuery({ queryKey: ["growth-content"], queryFn: () => load() });
  const [kw, setKw] = useState("");
  const [type, setType] = useState<"blog" | "faq">("blog");
  const act = useAct(() => draft({ data: { type, keyword: kw } }), ["growth-content"]);
  return (
    <div className="space-y-4 pt-4">
      <Panel title="Draft content">
        <div className="flex flex-col gap-2 sm:flex-row">
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={type} onChange={(e) => setType(e.target.value as "blog" | "faq")}><option value="blog">Blog post</option><option value="faq">FAQ page</option></select>
          <Input placeholder='e.g. "website design for HVAC companies in Birmingham"' value={kw} onChange={(e) => setKw(e.target.value)} />
          <Button onClick={() => act.mutate(undefined)} disabled={act.isPending || kw.length < 3}>{act.isPending ? "Drafting…" : "Draft"}</Button>
        </div>
        <Note msg={act.msg} />
      </Panel>
      {q.data?.length ? (
        <ul className="divide-y rounded-lg border">
          {q.data.map((c) => <li key={c.id} className="flex justify-between gap-3 p-3 text-sm"><span className="truncate">{c.title}</span><Pill tone="neutral">{c.type} · {c.status}</Pill></li>)}
        </ul>
      ) : <EmptyState title="No drafts yet" description="Each draft includes a title, description, links and image text." />}
    </div>
  );
}

function Reviews() {
  const load = useServerFn(G.listReviewRequests);
  const create = useServerFn(G.createReviewRequest);
  const mark = useServerFn(G.markReviewRequest);
  const q = useQuery({ queryKey: ["growth-reviews"], queryFn: () => load() });
  const [f, setF] = useState({ name: "", email: "", phone: "", channel: "email" as "email" | "sms", smsOptIn: false, reviewLink: "", jobId: "" });
  const act = useAct(() => create({ data: f }), ["growth-reviews"]);
  const mk = useAct((v: { id: string; field: "clicked" | "review_left" }) => mark({ data: v }), ["growth-reviews"]);
  return (
    <div className="space-y-4 pt-4">
      <Panel title="Ask a happy customer for a review">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Review page link"><Input value={f.reviewLink} onChange={(e) => setF({ ...f, reviewLink: e.target.value })} placeholder="https://g.page/r/…" /></Field>
          <Field label="Email"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" checked={f.channel === "email"} onChange={() => setF({ ...f, channel: "email" })} />Email</label>
          <label className="flex items-center gap-2"><input type="radio" checked={f.channel === "sms"} onChange={() => setF({ ...f, channel: "sms" })} />Text</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.smsOptIn} onChange={(e) => setF({ ...f, smsOptIn: e.target.checked })} />Customer opted in to texts</label>
        </div>
        <div className="mt-3 flex items-center gap-3"><Button onClick={() => act.mutate(undefined)} disabled={act.isPending || !f.name || !f.reviewLink}>Queue request</Button><Note msg={act.msg ?? mk.msg} /></div>
      </Panel>
      {q.data?.length ? (
        <ul className="divide-y rounded-lg border">
          {q.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>{r.customer_name} · {r.channel} · {r.sent_at ? "sent" : "not sent"}</span>
              <div className="flex gap-2">
                <Button size="sm" variant={r.clicked ? "default" : "outline"} onClick={() => mk.mutate({ id: r.id, field: "clicked" })}>Clicked</Button>
                <Button size="sm" variant={r.review_left ? "default" : "outline"} onClick={() => mk.mutate({ id: r.id, field: "review_left" })}>Reviewed</Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Listening() {
  const load = useServerFn(G.listQna);
  const scan = useServerFn(G.scanQna);
  const draft = useServerFn(G.draftQnaReply);
  const setS = useServerFn(G.setQnaStatus);
  const q = useQuery({ queryKey: ["growth-qna"], queryFn: () => load() });
  const scanAct = useAct(async () => { const r = await scan(); return { note: `Found ${r.reddit ?? 0} Reddit and ${r.quora ?? 0} Quora posts.${r.errors.length ? ` ${r.errors.join(" ")}` : ""}` }; }, ["growth-qna"]);
  const draftAct = useAct((id: string) => draft({ data: { id } }), ["growth-qna"]);
  const st = useAct((v: { id: string; status: "posted" | "skipped" }) => setS({ data: v }), ["growth-qna"]);
  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center gap-3"><Button onClick={() => scanAct.mutate(undefined)} disabled={scanAct.isPending}><RefreshCw className="mr-1 size-4" />Scan Reddit & Quora</Button><span className="text-xs text-muted-foreground">Daily cap: {q.data ? Object.entries(q.data.caps).filter(([k]) => k === "reddit" || k === "quora").map(([k, v]) => `${k} ${v}`).join(", ") : ""}. You post replies yourself.</span></div>
      <Note msg={scanAct.msg ?? draftAct.msg ?? st.msg} />
      {q.data?.rows.length ? (
        <ul className="space-y-2">
          {q.data.rows.map((p) => (
            <li key={p.id} className="rounded-lg border p-3 text-sm">
              <a href={p.post_url} target="_blank" rel="noreferrer noopener" className="font-medium underline">{p.post_title}</a>
              <div className="mt-1 flex flex-wrap gap-2"><Pill tone="neutral">{p.source_platform}</Pill><Pill tone="neutral">match {p.relevance}</Pill><Pill tone="neutral">{p.status}</Pill></div>
              <div className="mt-2 flex flex-wrap gap-2">
                {p.status === "new" && <Button size="sm" onClick={() => draftAct.mutate(p.id)} disabled={draftAct.isPending}>Draft reply</Button>}
                <Button size="sm" variant="outline" onClick={() => st.mutate({ id: p.id, status: "posted" })}>I posted it</Button>
                <Button size="sm" variant="ghost" onClick={() => st.mutate({ id: p.id, status: "skipped" })}>Skip</Button>
              </div>
            </li>
          ))}
        </ul>
      ) : <EmptyState title="No matching posts" description="Only strong matches (service + city + a real request) appear." />}
    </div>
  );
}

function Referrals() {
  const load = useServerFn(G.listReferrals);
  const create = useServerFn(G.createReferral);
  const setS = useServerFn(G.setReferralStatus);
  const q = useQuery({ queryKey: ["growth-ref"], queryFn: () => load() });
  const [f, setF] = useState({ name: "", email: "", optIn: false, reward: "" });
  const act = useAct(() => create({ data: { name: f.name, email: f.email, optIn: true, reward: f.reward ? Number(f.reward) : null } }), ["growth-ref"]);
  const st = useAct((v: { id: string; status: "shared" | "redeemed" | "closed" }) => setS({ data: v }), ["growth-ref"]);
  const funnel = ["invited", "shared", "redeemed", "closed"].map((s) => ({ s, n: q.data?.filter((r) => r.status === s).length ?? 0 }));
  return (
    <div className="space-y-4 pt-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{funnel.map((x) => <MetricCard key={x.s} label={x.s} value={String(x.n)} />)}</div>
      <Panel title="Invite a happy customer">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Reward ($, optional)"><Input type="number" value={f.reward} onChange={(e) => setF({ ...f, reward: e.target.value })} /></Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.optIn} onChange={(e) => setF({ ...f, optIn: e.target.checked })} />They agreed to receive a referral email</label>
        <div className="mt-3 flex items-center gap-3"><Button onClick={() => act.mutate(undefined)} disabled={act.isPending || !f.optIn || !f.name || !f.email}>Queue invite</Button><Note msg={act.msg ?? st.msg} /></div>
      </Panel>
      {q.data?.length ? (
        <ul className="divide-y rounded-lg border">
          {q.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>{r.referrer_name} · <code>{r.code}</code> · {r.status}</span>
              <div className="flex gap-2">{(["shared", "redeemed", "closed"] as const).map((s) => <Button key={s} size="sm" variant="outline" onClick={() => st.mutate({ id: r.id, status: s })} className="capitalize">{s}</Button>)}</div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Partners() {
  const load = useServerFn(G.listPartners);
  const add = useServerFn(G.addPartner);
  const setS = useServerFn(G.setPartnerStatus);
  const q = useQuery({ queryKey: ["growth-partners"], queryFn: () => load() });
  const [f, setF] = useState({ name: "", type: "", email: "" });
  const act = useAct(() => add({ data: f }), ["growth-partners"]);
  const st = useAct((v: { id: string; status: "sent" | "responded" }) => setS({ data: v }), ["growth-partners"]);
  return (
    <div className="space-y-4 pt-4">
      <Panel title="Add a possible partner">
        <p className="mb-3 text-sm text-muted-foreground">Good fits: {q.data?.suggestions.join(", ")}. Jarvis drafts the pitch; you send it yourself.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Business name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Type"><Input value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} /></Field>
          <Field label="Email (optional)"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        </div>
        <div className="mt-3 flex items-center gap-3"><Button onClick={() => act.mutate(undefined)} disabled={act.isPending || !f.name}>Draft pitch</Button><Note msg={act.msg ?? st.msg} /></div>
      </Panel>
      {q.data?.rows.length ? (
        <ul className="divide-y rounded-lg border">
          {q.data.rows.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>{p.business_name} · {p.business_type} · {p.status}</span>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => st.mutate({ id: p.id, status: "sent" })}>I sent it</Button><Button size="sm" variant="outline" onClick={() => st.mutate({ id: p.id, status: "responded" })}>They replied</Button></div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Social() {
  const load = useServerFn(G.listSocial);
  const draft = useServerFn(G.draftSocial);
  const q = useQuery({ queryKey: ["growth-social"], queryFn: () => load() });
  const [idea, setIdea] = useState("");
  const act = useAct(() => draft({ data: { idea } }), ["growth-social"]);
  return (
    <div className="space-y-4 pt-4">
      <Panel title="Draft an Instagram post">
        <div className="flex flex-col gap-2 sm:flex-row"><Input placeholder="e.g. Before/after of a site we rebuilt" value={idea} onChange={(e) => setIdea(e.target.value)} /><Button onClick={() => act.mutate(undefined)} disabled={act.isPending || idea.length < 3}>Draft</Button></div>
        <Note msg={act.msg} />
      </Panel>
      {q.data?.length ? (
        <ul className="divide-y rounded-lg border">{q.data.map((s) => <li key={s.id} className="flex justify-between gap-3 p-3 text-sm"><span className="line-clamp-2">{s.caption}</span><Pill tone="neutral">{s.status}</Pill></li>)}</ul>
      ) : <EmptyState title="No posts yet" description="Approved posts publish from Jarvis → Instagram once Meta is connected." />}
    </div>
  );
}

function Events() {
  const load = useServerFn(G.listEvents);
  const scan = useServerFn(G.scanEvents);
  const setS = useServerFn(G.setEventStatus);
  const q = useQuery({ queryKey: ["growth-events"], queryFn: () => load() });
  const act = useAct(async () => { const r = await scan(); return { note: `Found ${r.added} new events.` }; }, ["growth-events"]);
  const st = useAct((v: { id: string; status: "reviewed" | "attending" | "skipped" }) => setS({ data: v }), ["growth-events"]);
  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center gap-3"><Button onClick={() => act.mutate(undefined)} disabled={act.isPending}><RefreshCw className="mr-1 size-4" />Find local events</Button><Note msg={act.msg ?? st.msg} /></div>
      {q.data?.length ? (
        <ul className="space-y-2">
          {q.data.map((e) => (
            <li key={e.id} className="rounded-lg border p-3 text-sm">
              {e.url ? <a href={e.url} target="_blank" rel="noreferrer noopener" className="font-medium underline">{e.event_name}</a> : e.event_name}
              <p className="text-muted-foreground line-clamp-2">{e.notes}</p>
              <div className="mt-2 flex flex-wrap gap-2"><Pill tone="neutral">score {e.relevance_score}</Pill>
                {(["attending", "reviewed", "skipped"] as const).map((s) => <Button key={s} size="sm" variant="outline" onClick={() => st.mutate({ id: e.id, status: s })} className="capitalize">{s}</Button>)}
              </div>
            </li>
          ))}
        </ul>
      ) : <EmptyState title="No events yet" description="Jarvis only suggests — you decide what to attend." />}
    </div>
  );
}
