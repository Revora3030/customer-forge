import { DEMO_PREVIEW_EXPIRED_HREF } from "@/lib/demo-preview-label";

/**
 * Plain centre message for a dead /p/:token link. Never renders site content.
 * The get-started link is always present so an expired or invalid token still
 * has a clear next step (item 18).
 */
export function PreviewMessage({
  title,
  body,
  href = DEMO_PREVIEW_EXPIRED_HREF,
  cta = "Get started",
}: {
  title: string;
  body: string;
  href?: string;
  cta?: string;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 text-center">
      <div>
        <h1 className="font-display text-[22px] font-semibold">{title}</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">{body}</p>
        <p className="mt-4">
          <a
            href={href}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background underline-offset-4 hover:opacity-90"
          >
            {cta}
          </a>
        </p>
      </div>
    </main>
  );
}
