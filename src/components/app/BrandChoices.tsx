/**
 * BRAND CHOICES — the owner's style, colours and font, chosen before the AI
 * composes anything.
 *
 * Everything here is optional: left alone, Revora and the AI pick the look.
 * Anything set here is final — the composer folds these values over whatever
 * the AI proposes, so a generated site always matches the real brand. Choices
 * are remembered per workspace in this browser only; no facts, no copy.
 */
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { DESIGN_DIRECTIONS } from "@/lib/design-directions";
import type { BrandPreference } from "@/lib/builder/composition-preview";
import { cn } from "@/lib/utils";

const FONTS = [
  "Inter",
  "Manrope",
  "Figtree",
  "Sora",
  "Space Grotesk",
  "IBM Plex Sans",
  "Playfair Display",
  "Instrument Serif",
  "Lora",
  "Archivo Black",
];

const EMPTY: BrandPreference = {
  tone: "any",
  primaryColor: null,
  secondaryColor: null,
  accentColor: null,
  font: null,
  directionId: null,
};

const keyFor = (organizationId: string | null) => `revora:brand:${organizationId ?? "none"}`;

export function readBrandChoices(organizationId: string | null): BrandPreference {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(keyFor(organizationId));
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as BrandPreference) };
  } catch {
    return EMPTY;
  }
}

/** True when the owner actually chose something the composer must honour. */
export function hasBrandChoices(brand: BrandPreference): boolean {
  return Boolean(
    (brand.tone && brand.tone !== "any") ||
      brand.primaryColor ||
      brand.secondaryColor ||
      brand.accentColor ||
      brand.font ||
      brand.directionId,
  );
}

export function BrandChoices({
  organizationId,
  disabled = false,
  onChange,
}: {
  organizationId: string | null;
  disabled?: boolean;
  onChange?: (brand: BrandPreference) => void;
}) {
  const [open, setOpen] = useState(false);
  const [brand, setBrand] = useState<BrandPreference>(EMPTY);

  // Read once on the client, so the server render and the first paint agree.
  useEffect(() => {
    const stored = readBrandChoices(organizationId);
    setBrand(stored);
    onChange?.(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const update = (patch: Partial<BrandPreference>) => {
    const next = { ...brand, ...patch };
    setBrand(next);
    onChange?.(next);
    try {
      window.localStorage.setItem(keyFor(organizationId), JSON.stringify(next));
    } catch {
      // A browser with storage switched off still builds — the choice simply
      // applies to this request instead of being remembered.
    }
  };

  const chosenStyle = DESIGN_DIRECTIONS.find((entry) => entry.id === brand.directionId);
  const summary = hasBrandChoices(brand)
    ? [
        chosenStyle?.name,
        brand.tone && brand.tone !== "any" ? `${brand.tone} pages` : null,
        brand.font,
        brand.primaryColor,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Revora chooses for you";

  const color = (
    label: string,
    field: "primaryColor" | "secondaryColor" | "accentColor",
    hint: string,
  ) => (
    <label className="flex min-w-0 flex-1 items-center gap-2 text-[12px]">
      <input
        type="color"
        aria-label={`${label} colour`}
        disabled={disabled}
        value={brand[field] ?? (field === "secondaryColor" ? "#ffffff" : "#111111")}
        onChange={(event) => update({ [field]: event.target.value } as Partial<BrandPreference>)}
        className="size-8 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
      />
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        <span className="block text-[11px] text-muted-foreground">
          {brand[field] ?? hint}
        </span>
      </span>
    </label>
  );

  return (
    <div className="mt-3 rounded-lg border border-border bg-elevated/30 p-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-2 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[13px] font-medium">Your brand</span>
          <span className="block truncate text-[11.5px] text-muted-foreground">{summary}</span>
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[12px]">
              <span className="mb-1 block font-medium">Style</span>
              <select
                disabled={disabled}
                value={brand.directionId ?? ""}
                onChange={(event) => update({ directionId: event.target.value || null })}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-[12.5px]"
              >
                <option value="">Let Revora choose</option>
                {DESIGN_DIRECTIONS.map((direction) => (
                  <option key={direction.id} value={direction.id}>
                    {direction.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px]">
              <span className="mb-1 block font-medium">Headings font</span>
              <select
                disabled={disabled}
                value={brand.font ?? ""}
                onChange={(event) => update({ font: event.target.value || null })}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-[12.5px]"
              >
                <option value="">Let Revora choose</option>
                {FONTS.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset>
            <legend className="mb-1 text-[12px] font-medium">Pages</legend>
            <div className="flex flex-wrap gap-1.5">
              {(["any", "light", "dark"] as const).map((tone) => (
                <button
                  key={tone}
                  type="button"
                  disabled={disabled}
                  aria-pressed={(brand.tone ?? "any") === tone}
                  onClick={() => update({ tone })}
                  className={cn(
                    "min-h-9 cursor-pointer rounded-full border px-3 py-1.5 text-[12.5px] transition-colors",
                    (brand.tone ?? "any") === tone
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-elevated",
                  )}
                >
                  {tone === "any" ? "Either" : tone === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-3">
            {color("Main colour", "primaryColor", "not set")}
            {color("Page colour", "secondaryColor", "not set")}
            {color("Highlight", "accentColor", "not set")}
          </div>

          {hasBrandChoices(brand) ? (
            <button
              type="button"
              onClick={() => update(EMPTY)}
              className="cursor-pointer text-[12px] font-medium text-primary hover:underline"
            >
              Clear my choices
            </button>
          ) : null}
          <p className="text-[11.5px] text-muted-foreground">
            Anything you set here is used exactly as chosen. Anything left alone is decided for
            you, page by page.
          </p>
        </div>
      ) : null}
    </div>
  );
}
