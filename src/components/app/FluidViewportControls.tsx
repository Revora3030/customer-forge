/**
 * B13-5: continuous 320 to 1440 px slider beside the preset sizes, plus the
 * overflow and tap-target badges. Badges show only what the preview frame
 * measured at the width on screen; otherwise they say NOT MEASURED.
 */
import { Accessibility, TriangleAlert } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { clampFluidWidth, FLUID_MAX_WIDTH, FLUID_MIN_WIDTH, fluidBadges, type FluidBadge, type OverflowReading, type TapReading } from "@/lib/builder/fluid-viewport";
import type { CheckState } from "@/lib/builder/result-cards";
import { cn } from "@/lib/utils";

const BADGE_CLASS: Record<CheckState, string> = {
  pass: "border-success/40 bg-success/10 text-success",
  fail: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  not_verified: "border-border/70 bg-muted text-muted-foreground",
};

export function FluidViewportSlider({ width, onChange }: { width: number; onChange: (width: number) => void }) {
  return (
    <div className="mx-auto mb-2 flex w-full max-w-xl items-center gap-2 text-[12px] text-muted-foreground" data-testid="builder-preview-fluid">
      <span className="tnum" aria-hidden>{FLUID_MIN_WIDTH}</span>
      <Slider
        className="h-11 flex-1"
        min={FLUID_MIN_WIDTH}
        max={FLUID_MAX_WIDTH}
        step={1}
        value={[clampFluidWidth(width)]}
        onValueChange={([next]) => onChange(clampFluidWidth(next ?? width))}
        aria-label="Preview width in pixels"
        data-testid="builder-preview-fluid-slider"
      />
      <span className="tnum" aria-hidden>{FLUID_MAX_WIDTH}</span>
      <output className="tnum w-14 text-right font-medium text-foreground" aria-live="polite">
        {width}px
      </output>
    </div>
  );
}

function BadgeView({ badge }: { badge: FluidBadge }) {
  const Icon = badge.id === "overflow" ? TriangleAlert : Accessibility;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium", BADGE_CLASS[badge.state])}
      data-testid={badge.id === "overflow" ? "builder-preview-overflow" : "builder-preview-taps"}
      data-state={badge.state}
      title={badge.detail}
    >
      <Icon className="size-3" aria-hidden />
      {badge.text}
    </span>
  );
}

export function FluidBadges({ viewportWidth, overflow, taps }: { viewportWidth: number; overflow: OverflowReading | null; taps: TapReading | null }) {
  return (
    <>
      {fluidBadges({ viewportWidth, overflow, taps }).map((badge) => (
        <BadgeView key={badge.id} badge={badge} />
      ))}
    </>
  );
}
