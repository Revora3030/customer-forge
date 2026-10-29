import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE = "src/routes/_authenticated/admin.jarvis.tsx";
const DIR = "src/components/app/jarvis";
const parts = readdirSync(DIR).filter((file) => /\.(tsx?|css)$/.test(file) && !file.includes(".test."));
const route = readFileSync(ROUTE, "utf8");
const all = [route, ...parts.map((file) => readFileSync(`${DIR}/${file}`, "utf8"))].join("\n");
const ui = [route, ...parts.filter((file) => file.endsWith(".tsx")).map((file) => readFileSync(`${DIR}/${file}`, "utf8"))];

const COMMAND_LABELS = [
  "Fix top error", "Propose an upgrade", "Fix stuck builds", "Seed daily routines", "Daily briefing", "Autopilot plan", "Prospect ideas",
  "Follow-up sequence", "Platform errors", "Builder health", "SEO readiness", "Site audit", "Growth strategy",
  "Offer review", "Outreach drafts", "Local SEO plan", "Reel scripts", "Lovable fix prompt",
];
const STARTER_LABELS = ["Demo from Google Maps", "Fix top error", "Daily briefing", "Autopilot plan", "Propose an upgrade", "Outreach drafts"];

describe("Jarvis page keeps every behaviour the rebuild must preserve", () => {
  it("keeps the route head, prompts, approvals copy and storage keys", () => {
    for (const text of [
      "Jarvis mission control — Revora",
      '{ name: "robots", content: "noindex" }',
      'createFileRoute("/_authenticated/admin/jarvis")',
      "Propose demo.build with only these facts.",
      "Opens a pull request into lovable-sync. Nothing merges until you merge it on GitHub.",
      "Approve and open pull request",
      "Approve and send to Claude Code",
      "Approve and recover",
      "Approve and build",
      "Spend authorized: No · Sending enabled: No",
      "missing proof never counts as a pass",
      "No guaranteed revenue claims",
      "“Checked” means the query ran—not that the subsystem is healthy.",
      "jarvis:draft",
      "jarvis:mode",
      "jarvis:dnc",
      "const MAX_LENGTH = 4000;",
      '["jarvis", "history"]',
      '["jarvis", "diagnostics"]',
      '["jarvis", "claude-code"]',
      '["jarvis", "prospect-demos"]',
      '["jarvis", "acquisition-readiness"]',
      '["jarvis", "capability-scorecard"]',
      "useJarvisVoice(voiceSynth, onVoiceFallback, voiceStream)",
      "Track it under Operations → Demo sites",
      "Demo sites, prospects, platform health, autopilot and scorecard.",
      "Clear your Jarvis chat?",
      "Load earlier messages",
      "Tap to talk",
    ]) {
      expect(all, text).toContain(text);
    }
  });

  it("lists all 18 quick commands and 6 starters", () => {
    const commands = route.slice(route.indexOf("const COMMANDS = ["), route.indexOf("] as const;", route.indexOf("const COMMANDS = [")));
    expect([...commands.matchAll(/^\s+\["([^"]+)",/gm)].map((match) => match[1])).toEqual(COMMAND_LABELS);
    const starters = route.slice(route.indexOf("const STARTERS = ["), route.indexOf("] as const;", route.indexOf("const STARTERS = [")));
    expect([...starters.matchAll(/^\s+\["([^"]+)",/gm)].map((match) => match[1])).toEqual(STARTER_LABELS);
  });

  it("keeps the accessible names and pressed states", () => {
    for (const label of [
      'aria-label="Jarvis conversation"', 'aria-label="Response style"', 'aria-label="Quick commands"',
      'aria-label="Open operations"', "Refresh diagnostics", '"Mute replies" : "Speak replies"', "Export chat",
      "Clear my chat", 'aria-label="Build a demo from a picture"', '"Stop microphone" : "Dictate"', 'aria-label="Send"',
      'aria-label="Jump to latest"', 'aria-label="More Jarvis actions"', 'aria-label="Stop speaking"', "Message Jarvis",
      'id="jarvis-message"', "aria-pressed={live}", "aria-pressed={voice}", "aria-pressed={listening}",
    ]) {
      expect(all, label).toContain(label);
    }
  });

  it("fixes the voice loop: every mic path stops playback first, and Live resumes only after a reply played out", () => {
    const listen = route.slice(route.indexOf("function listen("));
    expect(listen.indexOf("stopVoice();")).toBeGreaterThan(-1);
    expect(listen.indexOf("stopVoice();")).toBeLessThan(listen.indexOf("rec.start()"));
    expect(route).toContain("if (liveRef.current && !userStoppedRef.current) resumeLive();");
    expect(route).toContain("prev ? prev + \" \" + transcript : transcript");
    expect(route).toContain("rec.interimResults = true;");
  });

  it("uses no native confirm, no sub-12px text and no guessed progress stages", () => {
    for (const source of ui) {
      expect(source).not.toContain("window.confirm");
      expect(source).not.toMatch(/text-\[(?:8|9|10|11)(?:\.5)?px\]/);
    }
    expect(route).not.toContain("Checking the live site");
    const header = readFileSync(`${DIR}/JarvisHeader.tsx`, "utf8");
    expect(header).not.toContain("animate-pulse");
    expect(header).not.toMatch(/healthy/i);
    expect(route).toContain('label: "Checks ran"');
  });

  it("holds the global AI source-scan constraints", () => {
    const forbidden = [
      "ai.gateway." + "lovable.dev",
      "LOVABLE_" + "API_KEY",
      "GOOGLE_AI_" + "API_KEY",
      "OPENAI_" + "API_KEY",
      "@/lib/ai/" + "providers/",
      "api." + "openai.com",
      "generativelanguage." + "googleapis.com",
      "openrouter." + "ai",
    ];
    for (const needle of forbidden) expect(all, needle).not.toContain(needle);
    expect(all).not.toMatch(new RegExp("VITE_[A-Z_]*(OPENAI|GOOGLE_AI|CLOUDFLARE|OPENROUTER)"));
  });

  it("keeps the history server function admin-guarded with the new cursor", () => {
    const fns = readFileSync("src/lib/jarvis.functions.ts", "utf8");
    const history = fns.slice(fns.indexOf("export const getJarvisHistory"), fns.indexOf("export const clearJarvisHistory"));
    expect(history).toContain("await guardedAdmin(context);");
    expect(history).toContain("parseHistoryCursor(input)");
    expect(history).toContain('query.lt("created_at", cursor.before)');
    expect(fns).toContain("return runJarvis(db, userId, data.mode, data.page, conversationId, data.runId, data.model);");
  });

  it("mounts a fresh send card for every demo.send approval, so re-approving after Cancel reopens the sheet", () => {
    const after = route.slice(route.indexOf("const renderAfterProposal"));
    expect(after).toMatch(/<DemoBuildCard\s+key=\{`\$\{key\}:\$\{sendCard\.nonce\}`\}/);
    expect(route).toContain("nonce: (current[key]?.nonce ?? 0) + 1");
  });
});
