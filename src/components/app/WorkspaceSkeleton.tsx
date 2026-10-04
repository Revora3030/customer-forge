import { Panel } from "@/components/app/Bits";

export function WorkspaceSkeleton({
  title = "Loading your workspace",
  body = "We’re checking your secure workspace and finishing any background provisioning.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <div className="product-page">
      <div>
        <p className="eyebrow">Workspace</p>
        <h1 className="mt-1 font-display text-[24px] font-semibold">{title}</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <Panel key={item} className="h-24 animate-pulse p-5" aria-hidden="true">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="mt-4 h-4 w-2/3 rounded bg-muted" />
          </Panel>
        ))}
      </div>
      <Panel className="h-48 animate-pulse p-5" aria-hidden="true">
        <div className="h-4 w-40 rounded bg-muted" />
        <div className="mt-4 h-3 w-full max-w-xl rounded bg-muted" />
        <div className="mt-3 h-3 w-5/6 rounded bg-muted" />
        <div className="mt-3 h-3 w-2/3 rounded bg-muted" />
      </Panel>
    </div>
  );
}
