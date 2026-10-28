/**
 * Builder reliability fixes found by the October bug hunt. Each test pins the
 * code shape that closes one confirmed defect, so a later edit can't reopen it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("queued plans keep their own actions", () => {
  const hooks = read("src/lib/builder-requests.hooks.ts");

  it("stores and reads approved actions per request, never by bare step key", () => {
    expect(hooks).toContain("actionsRef.current.set(actionKey(task.id, step.key), step)");
    expect(hooks).toContain("actionsRef.current.get(actionKey(task.id, step.key))");
    expect(hooks).not.toMatch(/actionsRef\.current\.(get|set)\(step\.key/);
  });
});

describe("apply idempotency only answers with verified outcomes", () => {
  const fn = read("src/lib/site-agent.functions.ts");

  it("records agent_apply after live-page verification, not before", () => {
    const verify = fn.indexOf("verification = await verifyWorkspaceSite(supabase, orgId);");
    const record = fn.indexOf('kind: "agent_apply",');
    expect(verify).toBeGreaterThan(0);
    expect(record).toBeGreaterThan(verify);
  });

  it("claims the key before the first write and tags every undo with it", () => {
    const claim = fn.indexOf('kind: "agent_apply_claim"');
    const firstWrite = fn.indexOf('noteApplyStage(orgId, applyRunId, "writing the pages")');
    expect(claim).toBeGreaterThan(firstWrite);
    for (const kind of ["agent_apply_rolled_back", "agent_apply_failed_verification"]) {
      const at = fn.indexOf(`kind: "${kind}"`);
      expect(fn.slice(at, at + 400)).toContain("operationKey: data.operationKey || null");
    }
  });

  it("waits for a claimed run instead of applying the same batch twice", () => {
    expect(fn).toContain("outcome.claimed && !outcome.applied && !outcome.undone && wait < 33");
  });
});

describe("plans never use a stale picture of the site", () => {
  it("drops the cached context after inline edits and deferrals, and never caches an empty site", () => {
    expect(read("src/lib/builder/inline-edit.functions.ts")).toContain("invalidateWorkspaceContext(data.organizationId)");
    const fn = read("src/lib/site-agent.functions.ts");
    const defer = fn.indexOf("if (!agentContext.pages.length || activeBuild) {");
    expect(fn.slice(defer, defer + 800)).toContain("invalidateWorkspaceContext(orgId)");
    expect(read("src/lib/agent/workspace-context.server.ts")).toContain("if (!context.pages.length) {");
  });
});

describe("standing briefs survive long chats", () => {
  it("passes design memory, recall and the creative brief ahead of the trimmed conversation", () => {
    const fn = read("src/lib/site-agent.functions.ts");
    expect(fn).toContain("...data.history.slice(0, standingBriefs).map((turn) => turn.content),");
    expect(fn.match(/standingBriefs \+= 1;/g)).toHaveLength(3);
  });
});

describe("a dropped connection recovers every kind of planner reply", () => {
  it("saves chat answers, deferrals and unavailable replies under the request id", () => {
    const fn = read("src/lib/site-agent.functions.ts");
    for (const model of ['"chat-answer"', '"deferred"', '"unavailable"']) expect(fn).toContain(`}, ${model});`);
    expect(fn).toContain("result: { ...result, requestId: runId } as unknown as never,");
  });
});

describe("an inline save doesn't reload the preview that made it", () => {
  it("tags the draft ping with the preview's id and skips its own", async () => {
    const { readDraftPing } = await import("@/lib/builder/preview-bridge");
    const org = "11111111-1111-4111-8111-111111111111";
    expect(readDraftPing({ type: "draft-changed", organizationId: org, at: 1, origin: "preview-abc" })?.origin).toBe("preview-abc");
    const preview = read("src/components/app/BuilderPreview.tsx");
    expect(preview).toContain("if (ping?.origin === previewId.current) return;");
    expect(preview).toContain("announceDraftChange(organizationId, previewId.current);");
  });
});

describe("dead in-page buttons are judged per page", () => {
  it("only counts visible sections on the link's own page, with the renderer's ids", async () => {
    const { collectPageAnchors, repairHref } = await import("@/lib/builder/link-integrity");
    const pages = [{ id: "p-home", slug: "home" }, { id: "p-services", slug: "services" }, { id: "p-contact", slug: "contact" }];
    const anchors = collectPageAnchors(
      [
        { page_id: "p-home", kind: "quote", settings: {} },
        { page_id: "p-home", kind: "composition", settings: { role: "service_area", tree: { widget: "enquiry_form" } } },
        { page_id: "p-services", kind: "services", settings: {} },
        { page_id: "p-services", kind: "faq", settings: {}, is_visible: false },
      ],
      pages,
    );
    expect([...anchors.get("home")!].sort()).toEqual(["contact-form", "quote", "service-area"]);
    expect(anchors.get("services")!.has("faq")).toBe(false);
    const sitePages = pages.map(({ slug }) => ({ slug }));
    const home = anchors.get("home")!;
    // A "#quote" button on /services points nowhere there; "/#quote" works.
    expect(repairHref("#quote", sitePages, anchors.get("services")!, home)).not.toBeNull();
    expect(repairHref("/#quote", sitePages, anchors.get("services")!, home)).toBeNull();
    // The underscore form is pointed at the id the renderer writes.
    expect(repairHref("#service_area", sitePages, home, home)).toBe("#service-area");
  });
});

describe("the screen check's AI repair never runs alongside a chat request", () => {
  it("holds the chat queue while repairing and stands down when a request is running", () => {
    const hooks = read("src/lib/builder-requests.hooks.ts");
    expect(hooks).toContain("if (!ready || runningRef.current || held) return;");
    expect(hooks).toContain("holdQueue,");
    const panel = read("src/components/app/VisualCheckPanel.tsx");
    expect(panel).toContain("holdQueue?.(true);");
    expect(panel).toContain("holdQueue?.(false);");
    expect(panel).toContain("if (queueBusyRef.current) return;");
    const page = read("src/routes/_authenticated/app.website.tsx");
    expect(page.match(/holdQueue=\{requests\.holdQueue\}/g)).toHaveLength(2);
  });
});

describe("recovery after a deferral never returns the old 'still building' reply", () => {
  it("skips deferred rows once the request has been deferred", () => {
    const hooks = read("src/lib/builder-requests.hooks.ts");
    expect(hooks).toContain("skipDeferred: (deferRef.current.get(task.id) ?? 0) > 0,");
    expect(hooks).toContain("!(options.skipDeferred && (row.result as { deferred?: unknown }).deferred === true)");
  });
});

describe("leaving the builder never loses or duplicates a request", () => {
  it("keeps plans awaiting approval pending, and never shows a resumed request twice or as 'Done.'", () => {
    const hooks = read("src/lib/builder-requests.hooks.ts");
    expect(hooks).toContain('if (task.state === "complete" || task.state === "failed" || task.state === "skipped")\n        clearPending(organizationId, task.id);');
    // Pending ids keep "~r", saved ids are normalised to "_r": both sides
    // compare by the base request id.
    expect(hooks).toContain(".filter((pair) => !(pair.requestId && resumedIds.has(baseRequestId(pair.requestId))))");
    expect(hooks).toContain("const resumedIds = new Set(resumed.map((request) => baseRequestId(request.id)));");
    // One hydration for the first load and branch switches; no "Done." filler.
    expect(hooks.match(/hydrateTasks\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(hooks).not.toContain('reply: pair.reply || "Done."');
    expect(read("src/lib/builder/hydrate-tasks.ts")).toContain("Revora didn't save how this request ended.");
  });

  it("saves the request the moment it is sent, under its own id", () => {
    const hooks = read("src/lib/builder-requests.hooks.ts");
    expect(hooks).toContain('remember([{ role: "user", content: instruction, kind: "text" }], id);');
    expect(hooks).toContain("rememberRequest(task.id, task.instruction);");
    expect(hooks).toContain("findSavedPlan(organizationId!, task.id, {");
  });
});

describe("review fixes for the chat request engine", () => {
  const hooks = read("src/lib/builder-requests.hooks.ts");
  const route = read("src/routes/_authenticated/app.website.tsx");

  it("a tracked first build never blocks the chat queue or counts as busy", () => {
    expect(hooks).toContain("const next = nextRunnable(tasks.filter((task) => !task.tracking));");
    expect(hooks).toContain('const busy = tasks.some((task) => !task.tracking && (task.state === "planning" || task.state === "building"));');
    expect(hooks).toContain('{ ...task, state: "building" as const, tracking: true, isBuild: true }');
    // A job no worker claims is not tracked forever. The rule lives in job-liveness
    // (tested there): a build waiting for its RETRY is counted from when the retry
    // was due, never from creation.
    expect(route).toContain("const stop = stopWaiting(latestRow as never);");
    expect(read("src/lib/builder/job-liveness.ts")).toContain('return Number.isFinite(created) && now - created > QUEUED_PICKUP_TIMEOUT_MS ? "never_started" : null;');
  });

  it("a resumed request only reuses a plan the server's 15-minute apply dedupe still covers", () => {
    expect(hooks).toContain("export const PLAN_REUSE_MAX_AGE_MS = 12 * 60 * 1000;");
    expect(hooks).toContain("since: new Date(Date.now() - PLAN_REUSE_MAX_AGE_MS).toISOString(),");
    expect(hooks).toContain('if (options.since) query = query.gte("created_at", options.since);');
    // Dropped-connection recovery accepts only this attempt's plan.
    expect(hooks).toContain("since: planStartedAt,");
  });

  it("retries are recorded on the pending list like new requests", () => {
    const retry = hooks.slice(hooks.indexOf("retry: (id: string) => {"), hooks.indexOf("dismiss: (id: string) => {"));
    expect(retry).toContain("addPending(organizationId, {");
    expect(retry).toContain("clearPending(organizationId, id);");
    expect(retry).toContain("restored: false");
  });

  it("the owner message is not saved early where thread columns are missing", () => {
    expect(hooks).toContain("if (threadColumnsMissing()) return;");
    expect(hooks).toContain("if (turn.role === \"user\" && turn.requestId) savedUserTurnRef.current.add(turn.requestId);");
  });

  it("cancelling a queued request saves a cancelled end, and branch switches keep queued work", () => {
    expect(hooks).toContain('remember([{ role: "assistant", content: "Cancelled.", taskResult: { state: "skipped" } }], id);');
    expect(hooks).toContain('current.filter((task) => !task.restored && (task.state === "queued" || task.state === "planning" || task.state === "building")),');
  });

  it("the screen check only follows changes applied live in this session", () => {
    expect(route.match(/appliedThisSession\(requests\.tasks\)/g)).toHaveLength(2);
  });
});

describe("autonomous runs keep one request id from planning through apply", () => {
  it("forwards the request id to the planner and a per-attempt operation key to apply", () => {
    const fn = read("src/lib/site-agent.functions.ts");
    const run = fn.slice(fn.indexOf("export const runWebsiteTask"), fn.indexOf("export const builderMediaCapabilities"));
    expect(run).toContain("const requestId = normaliseRequestId(input?.requestId);");
    expect(run).toContain("const runId = data.requestId ?? crypto.randomUUID();");
    expect(run).toContain("requestId: runId,");
    expect(run).toContain("operationKey: `${runId}:${attemptNumber}`,");
  });
  it("the screen check and audit upgrades start one id per run and show its stages", () => {
    const panel = read("src/components/app/VisualCheckPanel.tsx");
    expect(panel).toContain("useBuildProgress(organizationId, Boolean(repairRunId), repairRunId)");
    expect(panel).toContain("requestId: runId");
    const upgrades = read("src/lib/auto-upgrade.hooks.ts");
    expect(upgrades).toContain("requestId: runId");
    expect(read("src/lib/builder/progress.hooks.ts")).toContain("stepLabel(job.current_step)");
  });
});

describe("undoing an AI change also undoes its look changes", () => {
  it("saves the theme/tokens/backdrop and SEO settings in the apply's restore point", () => {
    const fn = read("src/lib/site-agent.functions.ts");
    expect(fn).toContain('supabase.from("website_settings").select("generation, seo").eq("organization_id", orgId).maybeSingle(),');
    expect(fn).toContain("? { generation: (lookRow as { generation: unknown }).generation as never }");
  });
});

describe("a leftover fresh-rebuild marker never replaces a later build's draft", () => {
  it("tags the marker with its build and clears markers from other builds", () => {
    expect(read("src/lib/site-engine.functions.ts")).toContain("pendingBuild: { ...(marker as Record<string, unknown>), jobId: job.id }");
    const worker = read("src/lib/site-engine.worker.server.ts");
    expect(worker).toContain('if (typeof markerJobId === "string" && markerJobId !== job.id) {');
  });
});
