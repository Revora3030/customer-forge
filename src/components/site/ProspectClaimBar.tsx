import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Monitor, Smartphone, X } from "lucide-react";
import { getProspectClaim } from "@/lib/prospect-claim.functions";
import { GROWTH_SYSTEM } from "@/lib/offer";
import { sendPreviewEvent, sendPreviewEventOnce } from "@/lib/preview-beacon-sender";

/**
 * Floating bar on a prospect demo preview: who it was built for, a phone-size
 * preview, and the claim button that starts signup with everything pre-filled.
 * Renders nothing for ordinary preview links or once the demo is claimed.
 */
export function ProspectClaimBar({ token, page = "home" }: { token: string; page?: string }) {
  const load = useServerFn(getProspectClaim);
  const claim = useQuery({
    queryKey: ["prospect-claim", token],
    queryFn: () => load({ data: { token } }),
    staleTime: 60_000,
    retry: false,
  });
  const [embedded, setEmbedded] = useState(false);
  const [phoneView, setPhoneView] = useState(false);

  useEffect(() => {
    // Inside the phone-size frame the bar would cover the page; hide it there.
    setEmbedded(window.self !== window.top);
  }, []);

  if (embedded || !claim.data?.claimable) return null;
  const name = claim.data.businessName ?? "your business";

  return (
    <>
      <div className="h-36 sm:h-20" aria-hidden />
      <div
        role="region"
        aria-label="Website preview"
        className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-white/20 bg-neutral-950/80 px-4 py-3 text-white shadow-2xl backdrop-blur-md sm:flex-nowrap"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Preview for {name}</p>
          <p className="truncate text-xs text-white/70">Built by Revora Growth Systems · {`${GROWTH_SYSTEM.fullAccessWindow} free, no card needed`}</p>
        </div>
        <button
          type="button"
          onClick={() => setPhoneView(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/25 px-3 text-xs font-medium hover:bg-white/10"
        >
          <Smartphone className="size-4" aria-hidden />
          Phone view
        </button>
        <Link
          to="/get-started"
          search={{ claim: token }}
          // Anonymous engagement for the operator; a no-op for the operator's own looks.
          onMouseEnter={() => sendPreviewEventOnce(token, "claim_hover", page)}
          onFocus={() => sendPreviewEventOnce(token, "claim_hover", page)}
          onClick={() => sendPreviewEvent(token, "claim_click", page)}
          className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-white px-4 text-sm font-semibold text-neutral-950 hover:bg-white/90 sm:w-auto sm:shrink-0"
        >
          Claim your website — start free trial
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      {phoneView ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${name} on a phone`}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setPhoneView(false)}
        >
          <div className="flex max-h-full flex-col items-center gap-3" onClick={(event) => event.stopPropagation()}>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPhoneView(false)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-neutral-950"
              >
                <Monitor className="size-4" aria-hidden />
                Desktop view
              </button>
              <button
                type="button"
                aria-label="Close phone view"
                onClick={() => setPhoneView(false)}
                className="inline-flex size-9 items-center justify-center rounded-lg border border-white/30 text-white"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <iframe
              title={`${name} on a phone`}
              src={window.location.pathname}
              className="h-[min(780px,80vh)] w-[390px] max-w-full rounded-[2rem] border-[10px] border-neutral-900 bg-white"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
