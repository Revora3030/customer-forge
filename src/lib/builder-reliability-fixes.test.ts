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

describe("the free picture lane never bills the paid image model", () => {
  it("runs the router's picture chain free-only", () => {
    const router = read("src/lib/ai/router.server.ts");
    const imageLane = router.slice(router.indexOf("async function imageCall("), router.indexOf("export async function callPinnedPaidImage"));
    expect(imageLane).toContain("freeOnly: true");
  });
});

describe("OpenAI's free lane is metered in tokens", () => {
  it("splits flagship and mini/nano pools and stops at 90% of the allowance", async () => {
    const free = await import("@/lib/ai/free");
    free.resetOpenAiTokenUse();
    expect(free.openAiTokenPool("gpt-5.4")).toBe("flagship");
    expect(free.openAiTokenPool("gpt-4.1-nano")).toBe("mini");
    expect(free.openAiTokenPoolCap("flagship")).toBe(225_000);
    expect(free.openAiTokenPoolCap("mini")).toBe(2_250_000);
    free.noteOpenAiTokens("gpt-5.4", 224_999);
    expect(free.openAiTokensLocallyExhausted("gpt-5")).toBe(false);
    free.noteOpenAiTokens("gpt-5", 1);
    expect(free.openAiTokensLocallyExhausted("gpt-4o")).toBe(true);
    expect(free.openAiTokensLocallyExhausted("gpt-5-mini")).toBe(false);
    free.resetOpenAiTokenUse();
  });

  it("counts every free OpenAI answer and skips a spent pool", () => {
    const router = read("src/lib/ai/router.server.ts");
    expect(router).toContain('if (entry.name === "openai" && openAiPoolSpent(model)) return;');
    expect(router).toContain("void noteDurableFreeTokens(openAiTokenPoolKey(openAiTokenPool(model)), tokens);");
    const sql = read("supabase/migrations/20261016180000_openai_free_token_meter.sql");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.ai_note_free_tokens(text, integer) TO service_role;");
  });
});

describe("the free picture-edit mask is a valid PNG", () => {
  it("decodes to a full 512x512 white greyscale image with valid chunk CRCs", async () => {
    const { inflateSync } = await import("node:zlib");
    const crc32 = (bytes: Uint8Array) => {
      let crc = 0xffffffff;
      for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
      }
      return (crc ^ 0xffffffff) >>> 0;
    };
    const { FULL_COVERAGE_MASK_PNG_BASE64 } = await import("@/lib/ai/providers/cloudflare-image");
    const png = Buffer.from(FULL_COVERAGE_MASK_PNG_BASE64, "base64");
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    const idat: Buffer[] = [];
    let pos = 8;
    let width = 0;
    let height = 0;
    while (pos < png.length) {
      const length = png.readUInt32BE(pos);
      const type = png.subarray(pos + 4, pos + 8);
      const data = png.subarray(pos + 8, pos + 8 + length);
      expect(png.readUInt32BE(pos + 8 + length)).toBe(crc32(Buffer.concat([type, data])));
      if (type.toString() === "IHDR") {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
      }
      if (type.toString() === "IDAT") idat.push(data);
      pos += 12 + length;
    }
    expect([width, height]).toEqual([512, 512]);
    const pixels = inflateSync(Buffer.concat(idat));
    expect(pixels.length).toBe(512 * 513);
    expect(pixels.every((byte, i) => (i % 513 === 0 ? byte === 0 : byte === 255))).toBe(true);
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
    expect(hooks).toContain(".filter((pair) => !(pair.requestId && resumedIds.has(pair.requestId.split(\"~\")[0])))");
    expect(hooks).toContain("Revora didn't save how this request ended.");
  });
});
