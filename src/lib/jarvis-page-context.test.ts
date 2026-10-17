import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adminPath, pageKey, speakBrief } from "@/lib/jarvis-page-context";

describe("Jarvis knows which admin page you're on", () => {
  it("accepts only admin paths, without query strings", () => {
    expect(adminPath("/admin/payments?tab=all")).toBe("/admin/payments");
    expect(adminPath("/admin/")).toBe("/admin");
    expect(adminPath("/app/leads")).toBeNull();
    expect(adminPath("/admin/<script>")).toBeNull();
    expect(adminPath(42)).toBeNull();
  });

  it("maps paths to pages", () => {
    expect(pageKey("/admin")).toBe("overview");
    expect(pageKey("/admin/clients")).toBe("clients");
    expect(pageKey("/admin/clients/1b2c")).toBe("client");
    expect(pageKey("/admin/payments")).toBe("payments");
    expect(pageKey("/admin/plans")).toBe("other");
    expect(pageKey(null)).toBe("other");
  });
});

describe("spoken page briefs", () => {
  it("leads with what needs attention and never reads an unreadable number as zero", () => {
    const spoken = speakBrief("Payments", [
      { label: "Failed payments", value: 2, tone: "attention" },
      { label: "Collected", value: "$700.00" },
      { label: "Refunded", value: null },
    ]);
    expect(spoken).toBe("Payments. Needs attention. Failed payments: 2. Collected: $700.00. I couldn't read refunded just now.");
    expect(spoken).not.toContain("Refunded: 0");
  });

  it("says so when nothing needs attention", () => {
    expect(speakBrief("Domains", [{ label: "Domains live", value: 3 }])).toBe(
      "Domains. Nothing here needs you right now. Domains live: 3.",
    );
  });
});

describe("Jarvis is on every admin page", () => {
  it("mounts the dock in the admin layout and sends the page with each question", () => {
    expect(readFileSync("src/routes/_authenticated/admin.tsx", "utf8")).toContain("<JarvisDock />");
    const dock = readFileSync("src/components/app/JarvisDock.tsx", "utf8");
    expect(dock).toContain('send({ data: { message, mode: "brief", page } })');
    expect(dock).toContain("refetchInterval: 60_000");
    const fns = readFileSync("src/lib/jarvis.functions.ts", "utf8");
    expect(fns).toContain("return runJarvis(db, userId, data.mode, data.page);");
    expect(fns.slice(fns.indexOf("export const getJarvisPageBrief"))).toContain("await guardedAdmin(context);");
  });

  it("leaves demo workspaces and sandbox payments out of business numbers", () => {
    const server = readFileSync("src/lib/jarvis-page-context.server.ts", "utf8");
    expect(server).toContain('const realOrgs: Filter = (q) => q.eq("is_demo", false);');
    expect(server).toContain('const live: Filter = (q) => q.eq("environment", "live");');
  });
});
