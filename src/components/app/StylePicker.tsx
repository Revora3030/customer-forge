import { useEffect } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { siteFontsHref } from "@/lib/site-theme";
import { pairingPreference } from "@/lib/site-font-pairings";
import { resolvedStylePicks, styleFromProfile, styleProfilePatch } from "@/lib/builder/style-picks";

type ProfileLike = Record<string, unknown> | null | undefined;

/**
 * Three ready-made looks for the first build: palette swatch, a sample in the
 * look's heading font, and the layout feel. "Let the AI choose" is the default
 * and the way back. Cards stack one per row on a phone and every target is at
 * least 44px tall.
 */
export function StylePicker({
  profile,
  disabled,
  onChoose,
}: {
  profile: ProfileLike;
  disabled: boolean;
  onChoose: (patch: Record<string, string | null>) => void;
}) {
  const picks = resolvedStylePicks();
  const selected = styleFromProfile(profile);

  // The font sample needs its faces; one stylesheet for all three pairings.
  useEffect(() => {
    const href = siteFontsHref(pairingPreference(picks[0]!.pairing), picks.slice(1).flatMap((pick) => [pick.pairing.display, pick.pairing.body]));
    if (!href || document.querySelector(`link[data-style-picker-fonts]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-style-picker-fonts", "");
    document.head.appendChild(link);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <fieldset className="space-y-2" data-testid="style-picker">
      <legend className="text-[13px] font-semibold">Pick a look (optional)</legend>
      <p className="text-[12px] text-muted-foreground">
        Choose one and your first website is built in it. You can change it any time.
      </p>
      <div role="radiogroup" aria-label="Website look" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {picks.map((pick) => {
          const active = selected?.id === pick.id;
          return (
            <button
              key={pick.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChoose(styleProfilePatch(pick))}
              className={cn(
                "flex min-h-11 w-full flex-col gap-2 rounded-xl border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60",
                active ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/60",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold">{pick.name}</span>
                {active ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
              </span>
              <span className="flex gap-1.5" aria-label={`${pick.palette.name} colours`}>
                {[pick.palette.primary, pick.palette.secondary, pick.palette.accent].map((color) => (
                  <span key={color} className="size-7 rounded-full border border-black/10" style={{ backgroundColor: color }} />
                ))}
              </span>
              <span className="text-[20px] leading-tight" style={{ fontFamily: `"${pick.pairing.display}", serif` }}>
                Your business, done right
              </span>
              <span className="text-[12px] text-muted-foreground" style={{ fontFamily: `"${pick.pairing.body}", sans-serif` }}>
                {pick.feel}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-pressed={!selected}
        disabled={disabled || !selected}
        onClick={() => onChoose({ primary_color: null, secondary_color: null, accent_color: null, font_preference: null })}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium disabled:cursor-default",
          !selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/60",
        )}
      >
        {!selected ? <Check className="size-4" aria-hidden="true" /> : null}
        Skip: let the AI choose
      </button>
    </fieldset>
  );
}
