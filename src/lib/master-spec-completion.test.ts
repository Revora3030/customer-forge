/**
 * Tests for the master-spec completion commits: build stages + cancel,
 * failure labels, chat threads, picture approvals, publish smoke checks,
 * element actions, CRM export/tasks, build monitoring and source wiring.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GENERATION_STEPS } from "@/lib/site-engine";
import { describeBuildFailure, FAILURE_KIND_LABELS, BUILD_FAILURE_KINDS } from "@/lib/builder/build-failure";
import {
  baseRequestId,
  groupByRequest,
  kindForTurn,
  listBranches,
  normaliseBranch,
  normaliseRequestId,
  searchTurns,
  turnsForBranch,
} from "@/lib/builder/chat-thread";
import {
  imageApprovalSummary,
  isRenderableImageResponse,
  normaliseSlot,
  regenerationBrief,
  transitionImage,
} from "@/lib/builder/image-records";
import { evaluateSmoke, liveSiteUrl } from "@/lib/publish-smoke";
import { actionsForElement, elementFamily } from "@/lib/builder/element-actions";
import { csvCell, groupByStage, leadsToCsv, normaliseTaskTitle, sortTasks, taskState } from "@/lib/crm";
import { buildAlerts, summariseBuilds, summariseImages, summarisePublishes } from "@/lib/build-monitoring";
import { isNonProductionTraffic } from "@/lib/analytics-taxonomy";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("C: 14 build stages, cancel and failure labels", () => {
  it("has exactly 14 ordered stages with increasing progress ending at 100", () => {
    expect(GENERATION_STEPS).toHaveLength(14);
    const progress = GENERATION_STEPS.map((s) => s.progress);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
    expect(new Set(progress).size).toBe(14);
    expect(progress.at(-1)).toBe(100);
    expect(GENERATION_STEPS.at(-1)!.key).toBe("ready");
  });

  it("the worker records every non-final stage, in order", () => {
    const worker = read("src/lib/site-engine.worker.server.ts");
    const recorded = [...worker.matchAll(/await step\("([a-z]+)"\)/g)].map((m) => m[1]);
    expect(recorded).toEqual(GENERATION_STEPS.slice(0, -1).map((s) => s.key));
  });

  it("stage writes and completion are fenced on status=processing so a cancel stops the worker", () => {
    const worker = read("src/lib/site-engine.worker.server.ts");
    expect(worker).toMatch(/Cancellation fence[\s\S]{0,200}\.eq\("status", "processing"\)/);
    expect(worker).toMatch(/status: "completed"[\s\S]{0,400}\.eq\("status", "processing"\)/);
    expect(worker).toContain('if ((latest as { status?: string } | null)?.status === "cancelled") continue;');
    expect(worker).toContain('.neq("status", "cancelled")');
  });

  it("cancel is manager+, scoped to the workspace and only touches active jobs", () => {
    const block = read("src/lib/site-engine-cancel.functions.ts");
    expect(block).toContain('requireOrgRole(context.supabase, data.organizationId, context.userId, "manager")');
    expect(block).toContain('.eq("organization_id", data.organizationId)');
    expect(block).toContain('.in("status", ["queued", "processing"])');
    expect(block).toContain('action: "BUILD_CANCELLED"');
  });

  it("every failure kind has an owner label and failed/cancelled rows are described", () => {
    for (const kind of BUILD_FAILURE_KINDS) expect(FAILURE_KIND_LABELS[kind].length).toBeGreaterThan(5);
    expect(describeBuildFailure({ status: "completed" })).toBeNull();
    expect(describeBuildFailure({ status: "cancelled" })?.label).toBe("Cancelled by you");
    expect(describeBuildFailure({ status: "failed", failure_kind: "image" })?.label).toBe("Pictures couldn't be finished");
    expect(describeBuildFailure({ status: "failed", error_message: "[provider] 429 from gateway" })?.label).toBe("AI provider unavailable");
    const raw = describeBuildFailure({ status: "failed", error_message: "boom" })!;
    expect(raw.message).toBe("boom");
  });

  it("the UI shows the classified label, not the raw error", () => {
    expect(read("src/components/app/SiteEngine.tsx")).toContain("{failure.label}");
    expect(read("src/components/app/BuildLive.tsx")).toContain("failure.message");
  });
});

describe("A: chat request ids, kinds, branches, search", () => {
  it("normalises request ids to the DB format and keeps retries grouped", () => {
    expect(normaliseRequestId("tabc123~r9")).toBe("tabc123_r9");
    expect(normaliseRequestId("bad id!")).toBeNull();
    expect(normaliseRequestId("ab")).toBeNull();
    expect(baseRequestId("tabc123_r9")).toBe("tabc123");
    expect(baseRequestId("tabc123~rxyz")).toBe("tabc123");
  });

  it("derives a structured kind per turn", () => {
    expect(kindForTurn({ role: "user" })).toBe("text");
    expect(kindForTurn({ role: "assistant", taskResult: { state: "complete" } })).toBe("result");
    expect(kindForTurn({ role: "assistant", taskResult: { state: "failed" } })).toBe("error");
    expect(kindForTurn({ role: "assistant", kind: "voice" })).toBe("voice");
    expect(kindForTurn({ role: "assistant", kind: "nonsense" })).toBe("text");
  });

  it("keeps alternate branches separate from main", () => {
    expect(normaliseBranch("Darker Look!")).toBe("darker-look");
    expect(normaliseBranch("###")).toBe("main");
    const turns = [
      { role: "user" as const, content: "Make it blue", at: "1" },
      { role: "user" as const, content: "Try darker", at: "2", branch: "darker-look" },
      { role: "assistant" as const, content: "Done darker", at: "3", branch: "darker-look" },
    ];
    expect(listBranches(turns)).toEqual(["main", "darker-look"]);
    expect(turnsForBranch(turns, "main")).toHaveLength(1);
    expect(turnsForBranch(turns, "darker-look")).toHaveLength(2);
  });

  it("searches case- and accent-insensitively with every term required", () => {
    const turns = [
      { role: "user" as const, content: "Add a Café menu to the HOME page", at: "1" },
      { role: "assistant" as const, content: "Added the menu", at: "2" },
    ];
    expect(searchTurns(turns, "cafe home")).toHaveLength(1);
    expect(searchTurns(turns, "menu")).toHaveLength(2);
    expect(searchTurns(turns, "pricing")).toHaveLength(0);
    expect(searchTurns(turns, "  ")).toHaveLength(0);
  });

  it("groups a request with its replies", () => {
    const groups = groupByRequest([
      { role: "user", content: "a", at: "1", requestId: "t1" },
      { role: "assistant", content: "b", at: "2", requestId: "t1_r2" },
      { role: "user", content: "c", at: "3", requestId: "t2" },
    ]);
    expect(groups.get("t1")).toHaveLength(2);
    expect(groups.get("t2")).toHaveLength(1);
  });

  it("every saved turn from the request queue carries its task id", () => {
    const hook = read("src/lib/builder-requests.hooks.ts");
    const start = hook.indexOf("const runBuild = async");
    const end = hook.indexOf("// Work the queue");
    const calls = hook.slice(start, end).match(/remember\(\[/g) ?? [];
    const tagged = hook.slice(start, end).match(/\], task\.id\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    expect(tagged.length).toBe(calls.length);
    expect(read("src/lib/builder-memory.ts")).toContain("request_id: normaliseRequestId(turn.requestId)");
  });

  it("voice dictation never auto-sends and falls back to the existing recorder", () => {
    const tools = read("src/components/app/ChatThreadTools.tsx");
    expect(tools).toContain("if (!supported) return null;");
    expect(tools).not.toMatch(/onSubmit\(|send\(/);
  });
});

describe("D: picture approval records", () => {
  const base = { status: "pending" as const, source: "generated" as const, generation: 1 };
  it("follows the approval state machine", () => {
    expect(transitionImage(base, "approve")).toEqual({ ok: true, status: "approved", generation: 1 });
    expect(transitionImage({ ...base, status: "approved" }, "approve").ok).toBe(false);
    expect(transitionImage(base, "reject")).toMatchObject({ ok: true, status: "rejected" });
    expect(transitionImage({ ...base, status: "rejected" }, "regenerate")).toMatchObject({ ok: true, status: "regenerating" });
    expect(transitionImage({ ...base, status: "regenerating" }, "regenerated")).toEqual({ ok: true, status: "pending", generation: 2 });
    expect(transitionImage({ ...base, status: "regenerating" }, "regenerate_failed")).toMatchObject({ status: "failed" });
    expect(transitionImage({ ...base, status: "regenerating" }, "regenerate").ok).toBe(false);
  });

  it("never regenerates the owner's own photos", () => {
    const result = transitionImage({ ...base, source: "owner" }, "regenerate");
    expect(result.ok).toBe(false);
  });

  it("builds a regeneration brief from the recorded direction and rejection only", () => {
    const brief = regenerationBrief("Crew installing a roof at dusk", "faces are distorted", "warmer light");
    expect(brief).toContain("Crew installing a roof at dusk");
    expect(brief).toContain("rejected because: faces are distorted");
    expect(brief).toContain("warmer light");
    expect(brief).toMatch(/no text, no logos/);
  });

  it("validates slots and rendered responses", () => {
    expect(normaliseSlot("Home:Hero")).toBe("home:hero");
    expect(normaliseSlot("../etc")).toBeNull();
    expect(isRenderableImageResponse(200, "image/webp")).toBe(true);
    expect(isRenderableImageResponse(200, "text/html")).toBe(false);
    expect(isRenderableImageResponse(404, "image/png")).toBe(false);
  });

  it("summarises approvals (owner photos count as approved)", () => {
    const s = imageApprovalSummary([
      { status: "approved", source: "generated" },
      { status: "pending", source: "owner" },
      { status: "pending", source: "generated" },
      { status: "failed", source: "generated" },
    ]);
    expect(s).toEqual({ total: 4, approved: 2, needsReview: 1, failed: 1, allApproved: false });
  });

  it("server functions require manager+ and stay inside the workspace", () => {
    const fns = read("src/lib/image-records.functions.ts");
    expect(fns.match(/requireManager\(context\.supabase/g)?.length).toBeGreaterThanOrEqual(4);
    expect(fns).toContain("path.startsWith(`${organizationId}/`)");
    expect(fns).toContain('.eq("status", row.status)'); // compare-and-set claim
    expect(fns).toContain("arbitrary external URLs are never requested");
  });
});

describe("F: publish selection and post-publish smoke", () => {
  const html = (body: string) => `<html><body>${body}${" ".repeat(600)}</body></html>`;
  it("passes a real page and fails broken ones", () => {
    expect(evaluateSmoke([{ path: "/", status: 200, contentType: "text/html", body: html("Acme Roofing"), ms: 10 }], { businessName: "Acme Roofing" }).status).toBe("passed");
    const bad = evaluateSmoke([
      { path: "/", status: 500, contentType: "text/html", body: "", ms: 1 },
    ]);
    expect(bad.status).toBe("failed");
    expect(bad.checks[0]!.problem).toBe("HTTP 500");
    expect(evaluateSmoke([{ path: "/", status: 200, contentType: "text/html", body: html("{{ business.name }}"), ms: 1 }]).checks[0]!.problem).toMatch(/placeholder/);
    expect(evaluateSmoke([{ path: "/", status: 200, contentType: "text/html", body: html("Other Co"), ms: 1 }], { businessName: "Acme" }).status).toBe("failed");
    expect(evaluateSmoke([]).status).toBe("failed");
  });

  it("uses a custom domain only once DNS and SSL are verified", () => {
    expect(liveSiteUrl({ slug: "acme", customDomain: "acme.com", dnsOk: true, sslOk: true })).toBe("https://acme.com");
    expect(liveSiteUrl({ slug: "acme", customDomain: "acme.com", dnsOk: true, sslOk: false })).toBe("https://revoragrowthsystems.com/s/acme");
  });

  it("selecting a version saves the draft first and never publishes", () => {
    const fns = read("src/lib/publish-records.functions.ts");
    const select = fns.slice(fns.indexOf("export const selectVersionForPublish"), fns.indexOf("export const recordPublishAndSmoke"));
    expect(select).toContain('"manager"');
    expect(select.indexOf("website_versions\").insert")).toBeLessThan(select.indexOf("applyWebsiteRestore(context"));
    expect(select).not.toMatch(/publish_state:\s*"published"|published:\s*true/);
    expect(fns).toContain('.not("published_at", "is", null)');
    expect(read("src/lib/production.hooks.ts")).toContain("recordPublishAndSmoke");
  });
});

describe("E: point-and-click actions per element type", () => {
  it("classifies element kinds", () => {
    expect(elementFamily("hero_split")).toBe("hero");
    expect(elementFamily("quote_form")).toBe("form");
    expect(elementFamily("testimonials")).toBe("testimonial");
    expect(elementFamily("image")).toBe("image");
    expect(elementFamily(null)).toBe("section");
  });
  it("never asks the AI to invent facts", () => {
    for (const kind of ["hero", "text", "button", "image", "gallery", "form", "nav", "footer", "testimonial", "pricing", "faq", null]) {
      for (const action of actionsForElement(kind)) {
        expect(action.prompt).not.toMatch(/\b(invent|make up|fake)\b/i);
        expect(action.label.length).toBeGreaterThan(2);
      }
    }
    expect(actionsForElement("testimonial")[0]!.prompt).toMatch(/only shows real reviews/);
    expect(actionsForElement("pricing")[0]!.prompt).toMatch(/only shows prices from my services list/);
  });
});

describe("G: CRM board, export and tasks", () => {
  it("neutralises CSV formula injection and quotes cells", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+1 555")).toBe(`"'+1 555"`);
    expect(csvCell(null)).toBe(`""`);
  });
  it("exports leads with their pipeline stage", () => {
    const csv = leadsToCsv([{ name: "Ann", status: "booked", created_at: "2026-10-01T00:00:00Z", estimated_value: 500 }]);
    const [header, row] = csv.trim().split("\r\n");
    expect(header).toContain('"Pipeline stage"');
    expect(row).toContain('"Won"');
    expect(row).toContain('"Booked"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("groups leads into the 5 stages", () => {
    const groups = groupByStage([{ status: "qualified" as const }, { status: "lost" as const }, { status: "new" as const }]);
    expect(groups.map((g) => g.label)).toEqual(["New", "Contacted", "Quoted", "Won", "Closed"]);
    expect(groups.find((g) => g.key === "contacted")!.leads).toHaveLength(1);
  });
  it("orders tasks overdue → today → upcoming → undated → done", () => {
    const now = new Date("2026-10-05T12:00:00");
    const tasks = [
      { id: "d", title: "done", due_at: null, done_at: "x" },
      { id: "u", title: "up", due_at: "2026-10-09T09:00:00", done_at: null },
      { id: "n", title: "none", due_at: null, done_at: null },
      { id: "o", title: "over", due_at: "2026-10-01T09:00:00", done_at: null },
      { id: "t", title: "today", due_at: "2026-10-05T09:00:00", done_at: null },
    ];
    expect(sortTasks(tasks, now).map((t) => t.id)).toEqual(["o", "t", "u", "n", "d"]);
    expect(taskState(tasks[4]!, now)).toBe("due_today");
    expect(normaliseTaskTitle("   ")).toBeNull();
    expect(normaliseTaskTitle("  Call  back ")).toBe("Call back");
  });
  it("the leads page uses the 5-stage pipeline, tasks and export", () => {
    const page = read("src/routes/_authenticated/app.leads.tsx");
    expect(page).toContain("groupByStage(");
    expect(page).toContain("CRM_STAGES.map(");
    expect(page).toContain("<LeadTasks");
    expect(page).toContain("leadsToCsv(");
  });
});

describe("I: analytics recorder enforcement", () => {
  it("drops non-production traffic before recording", () => {
    const src = read("src/lib/conversion.ts");
    expect(src.indexOf("isNonProductionTraffic(")).toBeGreaterThan(-1);
    expect(src.indexOf("isNonProductionTraffic(")).toBeLessThan(src.indexOf("void recordConversion("));
    expect(isNonProductionTraffic("revoragrowthsystems.com", "/draft/acme")).toBe(true);
    expect(isNonProductionTraffic("revoragrowthsystems.com", "/pricing")).toBe(false);
  });
});

describe("L: build monitoring", () => {
  const t = (min: number) => new Date(Date.UTC(2026, 9, 5, 12, min)).toISOString();
  it("computes success rate, durations, failure kinds and slow stages", () => {
    const m = summariseBuilds([
      { status: "completed", created_at: t(0), started_at: t(0), completed_at: t(4), stage_timings: { pictures: 90000, copy: 30000 } },
      { status: "completed", created_at: t(0), started_at: t(0), completed_at: t(6), stage_timings: { pictures: 120000 } },
      { status: "failed", failure_kind: "image", failed_stage: "pictures", created_at: t(0) },
      { status: "failed", error_message: "[provider] 429", created_at: t(0) },
      { status: "cancelled", created_at: t(0) },
      { status: "processing", created_at: t(0) },
    ]);
    expect(m.successRate).toBe(50);
    expect(m.medianBuildSeconds).toBe(240);
    expect(m.failuresByKind.map((f) => f.kind).sort()).toEqual(["image", "provider"]);
    expect(m.failuresByStage).toEqual([{ stage: "pictures", count: 1 }]);
    expect(m.slowestStages[0]).toEqual({ stage: "pictures", medianSeconds: 90, samples: 2 });
    expect(m.cancelled).toBe(1);
    expect(m.active).toBe(1);
  });
  it("raises alerts on low success and failed live checks", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ status: i < 2 ? "completed" : "failed", created_at: t(0) }));
    const alerts = buildAlerts(summariseBuilds(rows), summarisePublishes([{ smoke_status: "failed" }]));
    expect(alerts.some((a) => a.includes("success rate"))).toBe(true);
    expect(alerts.some((a) => a.includes("live smoke check"))).toBe(true);
    expect(summariseImages([{ status: "approved", source: "generated" }]).approved).toBe(1);
  });
  it("is super-admin only", () => {
    const block = read("src/lib/build-monitoring.functions.ts");
    expect(block).toContain("assertSuperAdmin(context.supabase, context.userId)");
  });
});

describe("M/H: migration and browser QA contracts", () => {
  const sql = read("supabase/migrations/20261005140000_builder_crm_image_publish_records.sql");
  it("enables RLS on every new table and never deletes data", () => {
    for (const table of ["image_records", "lead_tasks", "publish_events"])
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    expect(sql).not.toMatch(/\bDELETE FROM\b|\bDROP TABLE\b|\bTRUNCATE\b/i);
    expect(sql).toContain("REFERENCES public.leads (id, organization_id)");
    expect(sql).toMatch(/GRANT SELECT ON public\.publish_events TO authenticated;/);
  });
  it("browser smoke covers 320–2560 and fails on accessibility problems", () => {
    const py = read("scripts/browser-smoke.py");
    for (const width of [320, 390, 768, 1280, 2560]) expect(py).toContain(`, ${width}, `);
    expect(py).toContain('and not result.get("a11yProblems")');
    expect(py).toContain("imagesWithoutAlt");
    expect(py).toContain("missingLang");
  });
});
