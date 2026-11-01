/**
 * "Your data" panel for Settings: export leads, request a full copy, or
 * request deletion. Requests are prefilled emails handled by a person (see
 * docs/runbooks/data-deletion-request.md). Nothing is deleted from here.
 */
import { Link } from "@tanstack/react-router";
import { Panel, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { dataRequestMailto, type DataRequestContext } from "@/lib/data-requests";

export function DataPrivacy(ctx: DataRequestContext & { canManage: boolean }) {
  return (
    <Panel className="p-5">
      <SectionHeading eyebrow="Privacy" title="Your data" />
      <p className="mt-2 text-[12.5px] text-muted-foreground">
        Download your leads as a CSV from the Leads page at any time. For a full copy of your data,
        or to delete your account and its data, send us a request from this account's email. We
        confirm it with you before acting. Details are in our{" "}
        <a href="/privacy" className="underline underline-offset-2 hover:text-primary">
          privacy policy
        </a>
        .
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link to="/app/leads">Export leads</Link>
        </Button>
        <Button variant="outline" asChild>
          <a href={dataRequestMailto("export", ctx)}>Request a copy of my data</a>
        </Button>
        {ctx.canManage ? (
          <Button variant="outline" asChild>
            <a href={dataRequestMailto("delete", ctx)}>Request account deletion</a>
          </Button>
        ) : null}
      </div>
      {!ctx.canManage ? (
        <p className="mt-3 text-[12px] text-muted-foreground">
          Only a workspace owner or admin can request deletion of the workspace.
        </p>
      ) : null}
    </Panel>
  );
}
