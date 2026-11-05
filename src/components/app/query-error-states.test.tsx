// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  feed: vi.fn(),
  findings: vi.fn(),
  approvals: vi.fn(),
  snapshots: vi.fn(),
  rows: vi.fn(),
}));

vi.mock("@/lib/visitor-errors.functions", () => ({ getVisitorErrorFeed: mocks.feed }));
vi.mock("@/lib/site-monitor.functions", () => ({ getSiteMonitorFindings: mocks.findings }));
vi.mock("@/lib/agent/approvals.functions", () => ({
  listAgentApprovalsFn: mocks.approvals,
  decideAgentApprovalFn: vi.fn(),
}));
vi.mock("@/lib/builder/site-snapshots.functions", () => ({
  listSiteSnapshotsFn: mocks.snapshots,
  saveSiteSnapshotFn: vi.fn(),
  startSiteFromSnapshotFn: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "gte", "order", "limit"]) chain[name] = () => chain;
  chain["then"] = (resolve: (value: unknown) => unknown) => resolve(mocks.rows());
  return { supabase: { from: () => chain } };
});

import { VisitorProblems } from "@/components/app/VisitorProblems";
import { SiteMonitorFindings } from "@/components/app/SiteMonitorFindings";
import { AgentApprovalsPanel } from "@/components/app/AgentApprovalsPanel";
import { LeadDeliveryFlags } from "@/components/app/LeadDeliveryFlags";
import { SitePerformance } from "@/components/app/SitePerformance";
import { SiteSnapshotPanel } from "@/components/app/SiteSnapshotPanel";

let root: Root | null = null;
let host: HTMLElement | null = null;

async function mount(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.clearAllMocks();
});

const failure = () => Promise.reject(new Error("boom"));
const rowsFailure = () => ({ data: null, error: new Error("boom") });

describe("a failed read is never shown as an empty state", () => {
  it("VisitorProblems says it could not check", async () => {
    mocks.feed.mockImplementation(failure);
    const el = await mount(<VisitorProblems organizationId="org" />);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain("couldn't check what visitors ran into");
    expect(el.textContent).toContain("Try again");
  });

  it("VisitorProblems still hides itself when the read worked and found nothing", async () => {
    mocks.feed.mockResolvedValue({ groups: [] });
    const el = await mount(<VisitorProblems organizationId="org" />);
    expect(el.innerHTML).toBe("");
  });

  it("SiteMonitorFindings says it could not check, and keeps its anchor", async () => {
    mocks.findings.mockImplementation(failure);
    const el = await mount(<SiteMonitorFindings organizationId="org" />);
    expect(el.querySelector("#site-monitor")).not.toBeNull();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain("couldn't check your live site");
  });

  it("AgentApprovalsPanel does not hide possibly-waiting approvals on error", async () => {
    mocks.approvals.mockImplementation(failure);
    const el = await mount(<AgentApprovalsPanel organizationId="org" isOwner />);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain("waiting for your approval");
  });

  it("AgentApprovalsPanel stays hidden when nothing is waiting", async () => {
    mocks.approvals.mockResolvedValue({ approvals: [] });
    const el = await mount(<AgentApprovalsPanel organizationId="org" isOwner />);
    expect(el.innerHTML).toBe("");
  });

  it("LeadDeliveryFlags says it could not check", async () => {
    mocks.rows.mockImplementation(rowsFailure);
    const el = await mount(<LeadDeliveryFlags organizationId="org" />);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain("couldn't check whether any new-lead emails failed");
  });

  it("SitePerformance shows the error, not 'No visits measured yet'", async () => {
    mocks.rows.mockImplementation(rowsFailure);
    const el = await mount(<SitePerformance organizationId="org" />);
    expect(el.textContent).toContain("couldn't read your speed measurements");
    expect(el.textContent).not.toContain("No visits measured yet");
  });

  it("SitePerformance still says no visits when the read worked and was empty", async () => {
    mocks.rows.mockImplementation(() => ({ data: [], error: null }));
    const el = await mount(<SitePerformance organizationId="org" />);
    expect(el.textContent).toContain("No visits measured yet");
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it("SiteSnapshotPanel does not claim there are no snapshots when the list failed", async () => {
    mocks.snapshots.mockImplementation(failure);
    const el = await mount(<SiteSnapshotPanel organizationId="org" />);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain("couldn't load the saved snapshots");
    expect(el.textContent).not.toContain("No snapshots saved yet");
  });
});
