import type { FactSourceRow } from "@/lib/builder/fact-sources";
import { missingFactCount } from "@/lib/builder/fact-sources";

/** Launch checklist: every business fact on the site and where it came from. */
export function FactSourcesList({ rows }: { rows: FactSourceRow[] }) {
  const missing = missingFactCount(rows);
  return (
    <section className="panel p-3" aria-labelledby="fact-sources-title">
      <h3 id="fact-sources-title" className="text-[13px] font-semibold">Business facts on your site</h3>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        {missing === 0
          ? "Every fact below comes from your business details. Nothing was guessed."
          : `${missing} missing — add ${missing === 1 ? "it" : "them"} in your business details before publishing. The AI won't make them up.`}
      </p>
      <ul className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-start justify-between gap-3 text-[12px]">
            <span className="min-w-0">
              <span className="font-medium">{row.label}</span>
              {row.value ? <span className="block truncate text-muted-foreground">{row.value}</span> : null}
            </span>
            <span
              className={
                row.source === "owner"
                  ? "shrink-0 rounded-full border border-border px-2 py-0.5 text-muted-foreground"
                  : "shrink-0 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-destructive"
              }
            >
              {row.source === "owner" ? "From your details" : "Missing"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
