/**
 * B13-5: continuous 320 to 1440 px slider beside the preset sizes, plus the
 * overflow and tap-target badges. Badges show only what the preview frame
 * measured at the width on screen; otherwise they say NOT MEASURED.
 */
import { useState } from "react";
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

/**
 * The preview frame is a whole site laid out at this width, so it must not
 * re-lay-out on every pixel of a drag: on iPhone Safari that repeated layout
 * of a heavy page ran the tab out of memory ("A problem repeatedly occurred").
 * The drag only moves the thumb and the number; the preview takes the new width
 * once the finger lifts (or a keyboard step lands).
 */
export function FluidViewportSlider({ width, onChange, max = FLUID_MAX_WIDTH }: { width: number; onChange: (width: number) => void; max?: number }) {
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  // The number is the real width on screen (a wide preset can exceed the slider
  // range); the thumb is pinned inside it.
  const shownWidth = dragWidth ?? width;
  const thumb = clampFluidWidth(shownWidth, 390, max);
  return (
    <div className="mx-auto mb-2 flex w-full max-w-xl items-center gap-2 text-[12px] text-muted-foreground" data-testid="builder-preview-fluid">
      <span className="tnum" aria-hidden>{FLUID_MIN_WIDTH}</span>
      <Slider
        className="h-11 flex-1"
        min={FLUID_MIN_WIDTH}
        max={max}
        step={1}
        value={[thumb]}
        onValueChange={([next]) => setDragWidth(clampFluidWidth(next ?? width, 390, max))}
        onValueCommit={([next]) => {
          const committed = clampFluidWidth(next ?? width, 390, max);
          setDragWidth(null);
          if (committed !== width) onChange(committed);
        }}
        aria-label="Preview width in pixels"
        data-testid="builder-preview-fluid-slider"
      />
      <span className="tnum" aria-hidden>{max}</span>
      <output className="tnum w-14 text-right font-medium text-foreground" aria-live="off">
        {shownWidth}px
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
