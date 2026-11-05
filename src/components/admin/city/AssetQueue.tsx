import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ImageIcon } from "lucide-react";
import { ageLabel } from "@/lib/ai-city";
import { getCityAssetQueue } from "@/lib/ai-city-assets.functions";
import type { AssetQueue as AssetQueueData } from "@/lib/ai-city-assets";

const KIND_LABEL = { image: "Pictures", voice: "Voice", motion: "Motion" } as const;

/**
 * JC-24: pictures waiting for an owner's review. Read-only, nothing is made
 * or approved here. Each row links to the workspace and to the builder, where
 * the Asset Swapper (B12-4) opens on a click of the picture.
 */
export function AssetQueue({ now }: { now: number }) {
  const load = useServerFn(getCityAssetQueue);
  const query = useQuery({
    queryKey: ["admin-city-assets"],
    queryFn: () => load(),
    refetchInterval: 60_000,
  });
  return (
    <AssetQueueView data={query.data} loading={query.isLoading} failed={query.isError} now={now} />
  );
}

export function AssetQueueView({
  data,
  loading,
  failed,
  now,
}: {
  data: AssetQueueData | undefined;
  loading: boolean;
  failed: boolean;
  now: number;
}) {
  if (loading)
    return <p className="mt-2 text-xs text-muted-foreground">Loading the asset queue…</p>;
  if (failed || !data || !data.available)
    return (
      <p role="alert" className="mt-2 text-xs text-destructive">
        Asset queue unavailable.
      </p>
    );
  return (
    <div className="mt-2 space-y-2">
      <ul className="grid grid-cols-3 gap-2 text-center" aria-label="Waiting by kind">
        {data.kinds.map((kind) => (
          <li key={kind.kind} className="rounded-md border border-border p-2">
            <p className="font-display text-lg font-semibold">
              {kind.recorded ? (kind.waiting ?? "—") : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground">{KIND_LABEL[kind.kind]}</p>
            {kind.recorded ? null : (
              <p className="text-[10px] text-muted-foreground">not recorded</p>
            )}
          </li>
        ))}
      </ul>
      {data.items.length ? (
        <ul className="space-y-2">
          {data.items.map((item) => (
            <li key={item.id} className="flex gap-3 rounded-md border border-border p-2">
              {item.thumbnail ? (
                <img
                  src={item.thumbnail}
                  alt={item.altText ?? ""}
                  loading="lazy"
                  className="size-16 shrink-0 rounded object-cover"
                />
              ) : (
                <span
                  className="flex size-16 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground"
                  aria-label="No thumbnail recorded"
                >
                  <ImageIcon className="size-5" aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="break-words text-xs font-medium">
                  {item.slot} · {item.workspace}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  waiting {item.at ? ageLabel(Math.max(0, now - Date.parse(item.at))) : "—"}
                  {item.attempt > 1 ? ` · attempt ${item.attempt}` : ""}
                  {item.model ? (
                    <>
                      {" "}
                      · <span className="break-all font-mono">{item.model}</span>
                    </>
                  ) : null}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px]">
                  <Link
                    to="/admin/clients/$orgId"
                    params={{ orgId: item.organizationId }}
                    className="inline-flex min-h-11 items-center text-gold underline-offset-2 hover:underline"
                  >
                    Workspace
                  </Link>
                  <Link
                    to="/app/website"
                    className="inline-flex min-h-11 items-center text-gold underline-offset-2 hover:underline"
                  >
                    Asset Swapper
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No pictures are waiting for review.</p>
      )}
      {data.total !== null && data.total > data.items.length ? (
        <p className="text-[11px] text-muted-foreground">
          Showing the newest {data.items.length} of {data.total}.
        </p>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        Read-only: nothing is made or approved here. The Asset Swapper opens when a picture is
        clicked in that workspace's builder. Voice and motion assets aren't stored as records yet.
      </p>
    </div>
  );
}
