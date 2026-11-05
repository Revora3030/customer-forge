import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { APPROVALS_QUERY_KEY } from "@/components/app/jarvis/ApprovalsInbox";
import { ApprovalBeaconStatus, ApprovalBeaconsSvg } from "./ApprovalBeacons";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => () => undefined,
  Link: ({ children, to }: { children: unknown; to: string }) => (
    <a href={to}>{children as never}</a>
  ),
}));
vi.mock("@/lib/jarvis.functions", () => ({
  listJarvisApprovalsFn: () => Promise.reject(new Error("not called")),
}));

const source = (name: string) => readFileSync(join(__dirname, name), "utf8");
function withData(items: { action_id: string; state: string }[] | "error", ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (items !== "error") client.setQueryData(APPROVALS_QUERY_KEY, { items });
  return renderToStaticMarkup(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("JC-14 beacons in the city", () => {
  it("draws nothing on the 2D map without a query client", () => {
    expect(
      renderToStaticMarkup(
        <svg>
          <ApprovalBeaconsSvg />
        </svg>,
      ),
    ).not.toContain("data-beacon");
  });

  it("lights the owning district, with a way in", () => {
    const html = withData(
      [
        { action_id: "demo.send", state: "pending" },
        { action_id: "demo.send", state: "pending" },
      ],
      <svg>
        <ApprovalBeaconsSvg />
      </svg>,
    );
    expect(html).toContain('data-beacon="growth"');
    expect(html).toContain('role="button"');
    expect(html).toContain("2 approvals waiting at");
    expect(html).toContain("Open approvals");
  });

  it("shows no beacon and says unavailable when the read has no data", () => {
    const svg = withData(
      "error",
      <svg>
        <ApprovalBeaconsSvg />
      </svg>,
    );
    expect(svg).not.toContain("data-beacon");
    const status = withData("error", <ApprovalBeaconStatus />);
    expect(status).toContain("Approvals unavailable");
    expect(status).not.toMatch(/\b0 approvals/);
    expect(status).not.toContain("Open approvals inbox");
    expect(status).toContain('href="/admin/approvals"');
  });

  it("status line names the district and offers the inbox", () => {
    const html = withData(
      [{ action_id: "image.create", state: "pending" }],
      <ApprovalBeaconStatus />,
    );
    expect(html).toContain("1 approval waiting");
    expect(html).toContain("Open approvals inbox");
  });

  it("holds still under reduced motion", () => {
    // 2D: CSS pulse only where the OS allows motion.
    expect(source("ApprovalBeacons.tsx")).toContain("motion-safe:animate-pulse");
    // 3D: no bob or spin unless the city's motion flag is on, and no extra frames requested either.
    expect(source("ApprovalBeacons3D.tsx")).toMatch(/if \(!motion \|\| !ref\.current\) return;/);
    expect(source("CityScene.tsx")).toContain("const beaconsPulse = motion && approvals.status");
  });

  it("stays visible in a night sky: unlit, un-fogged, not tone-mapped", () => {
    expect(source("ApprovalBeacons3D.tsx")).toContain("fog={false} toneMapped={false}");
  });

  it("keeps three.js out of the 2D map", () => {
    expect(source("ApprovalBeacons.tsx")).not.toMatch(/from\s+["'](three|@react-three)/);
  });
});
