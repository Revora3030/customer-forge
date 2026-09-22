import { useState } from "react";
import { CatchBoundary, createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { ErrorNote, LoadingRows, PageHead, Panel } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { DomainCenter } from "@/components/app/DomainCenter";
import { DomainOperations } from "@/components/app/DomainOperations";
import { useBusinessProfile, useWebsiteSettings } from "@/lib/queries";
import { useWorkspace } from "@/lib/use-tenant";
import { canManage } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/app/domain")({
  head: () => ({
    meta: [
      { title: "Domain setup — Revora" },
      {
        name: "description",
        content:
          "Buy a new domain or connect one you already own, with live DNS and HTTPS verification.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DomainPage,
});

/**
 * One panel failing must never take the whole domain page down: the owner still
 * needs the parts that work, plus a way to retry the part that didn't.
 */
function SafeSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  return (
    <CatchBoundary
      getResetKey={() => `domain-${title}-${attempt}`}
      errorComponent={({ error, reset }) => (
        <Panel className="space-y-3 p-5">
          <p className="text-[13px] font-medium">{title} couldn&apos;t load</p>
          <p className="text-[12px] text-muted-foreground">
            {error instanceof Error && error.message
              ? error.message
              : "Something went wrong while loading this section."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAttempt((value) => value + 1);
              reset();
            }}
          >
            <RefreshCw className="size-4" /> Try again
          </Button>
        </Panel>
      )}
    >
      {children}
    </CatchBoundary>
  );
}

function DomainPage() {
  const workspaceQuery = useWorkspace();
  const ws = workspaceQuery.data;
  const org = ws?.workspace?.organization;
  const orgId = ws?.workspace?.organizationId;
  const settingsQuery = useWebsiteSettings(orgId);
  const profileQuery = useBusinessProfile(orgId);
  const profile = profileQuery.data as Record<string, unknown> | null | undefined;
  const role = canManage(ws?.workspace?.role ?? "viewer");

  const loading = workspaceQuery.isLoading || (!!orgId && settingsQuery.isLoading);

  return (
    <div className="product-page">
      <PageHead
        eyebrow="Domain"
        title="Your domain"
        purpose="Buy a new web address or connect one you already own — you can do all of it yourself, no support request needed."
      />

      {workspaceQuery.error ? (
        <ErrorNote message={(workspaceQuery.error as Error).message} />
      ) : settingsQuery.error ? (
        <ErrorNote message={(settingsQuery.error as Error).message} />
      ) : null}

      {loading ? (
        <LoadingRows rows={5} />
      ) : (
        <>
          <SafeSection title="Domain setup">
            <DomainCenter
              organizationId={orgId}
              slug={org?.slug}
              businessName={org?.name ?? null}
              city={(profile?.["city"] as string) ?? null}
              industry={org?.industry ?? null}
              settings={settingsQuery.data}
              canManage={role}
            />
          </SafeSection>

          <SafeSection title="Certificate, routing and email">
            <DomainOperations
              organizationId={orgId}
              settings={settingsQuery.data}
              canManage={role}
            />
          </SafeSection>
        </>
      )}
    </div>
  );
}
