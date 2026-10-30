/**
 * Owner panel for OPTIONAL trade calculator figures (quality bar #14): typical
 * price ranges, finance terms and ROI inputs. Stored in the section's existing
 * settings JSON (`settings.calculator`), so no database migration. Leaving a
 * group blank keeps that view hidden on the live site; the default price
 * estimator is unchanged.
 */
import { useState } from "react";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSaveSection } from "@/lib/website-content.hooks";
import type { ContentSection } from "@/lib/website-content";
import {
  formatPriceRangeLines,
  parseFinanceFields,
  parsePriceRangeLines,
  parseRoiFields,
  readTradeCalculator,
  settingsHostCalculator,
  writeTradeCalculator,
} from "@/lib/trade-calculator";

const ROI_FIELDS = [
  ["label", "Heading", "Estimated rental return"],
  ["value_per_unit", "Value per unit ($)", "240"],
  ["unit", "Unit name", "night"],
  ["units_per_year", "Units per year", "365"],
  ["utilization_min", "Lowest utilisation (%)", "45"],
  ["utilization_max", "Highest utilisation (%)", "80"],
  ["upfront_cost", "Up-front cost ($, optional)", ""],
  ["annual_costs", "Yearly running costs ($, optional)", ""],
] as const;

export function SectionCalculatorFields({
  section,
  organizationId,
  canManage,
}: {
  section: ContentSection;
  organizationId: string | undefined;
  canManage: boolean;
}) {
  const saveSection = useSaveSection(organizationId);
  const [open, setOpen] = useState(false);
  if (!canManage || !settingsHostCalculator(section.kind, section.settings)) return null;
  const current = readTradeCalculator(section.settings);
  const f = (key: string) => `calc-${key}-${section.id}`;
  const stored = (current?.roi ?? {}) as Record<string, unknown>;
  const roiDefault: Record<string, string> = {
    label: String(stored["label"] ?? ""),
    value_per_unit: String(stored["valuePerUnit"] ?? ""),
    unit: String(stored["unit"] ?? ""),
    units_per_year: String(stored["unitsPerYear"] ?? ""),
    utilization_min: String(stored["utilizationMin"] ?? ""),
    utilization_max: String(stored["utilizationMax"] ?? ""),
    upfront_cost: String(stored["upfrontCost"] ?? ""),
    annual_costs: String(stored["annualCosts"] ?? ""),
  };

  return (
    <div className="mt-3">
      <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
        <Calculator className="size-4" /> {open ? "Hide" : "Calculator figures (optional)"}
      </Button>
      {open ? (
        <form
          className="mt-3 space-y-4 rounded-md border border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const get = (key: string) => String(form.get(key) ?? "");
            const priceRanges = parsePriceRangeLines(get("ranges"));
            const finance = parseFinanceFields(get("apr"), get("terms"), get("deposit"));
            const roi = parseRoiFields(Object.fromEntries(ROI_FIELDS.map(([key]) => [key, get(`roi_${key}`)])));
            const data = priceRanges.length || finance || roi
              ? { ...(priceRanges.length ? { priceRanges } : {}), ...(finance ? { finance } : {}), ...(roi ? { roi } : {}) }
              : null;
            saveSection.mutate({ id: section.id, patch: { settings: writeTradeCalculator(section.settings, data) } });
          }}
        >
          <p className="text-[13px] text-muted-foreground">
            Only figures you enter here are shown. Leave a group blank to keep it hidden; your price estimator stays the default.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={f("ranges")}>Typical price ranges</Label>
            <Textarea id={f("ranges")} name="ranges" rows={3} defaultValue={formatPriceRangeLines(current?.priceRanges)} placeholder={"Driveway | 150 | 300\nFull house wash | 400 | 900"} />
            <p className="text-[12px] text-muted-foreground">One per line: name | lowest | highest.</p>
          </div>
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-2 text-[13px] font-medium">Financing</legend>
            <div className="space-y-1.5">
              <Label htmlFor={f("apr")}>APR (%)</Label>
              <Input id={f("apr")} name="apr" inputMode="decimal" defaultValue={current?.finance ? String(current.finance.apr) : ""} placeholder="9.9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={f("terms")}>Terms (months)</Label>
              <Input id={f("terms")} name="terms" defaultValue={current?.finance?.termsMonths.join(", ") ?? ""} placeholder="12, 24, 36" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={f("deposit")}>Deposit (%, optional)</Label>
              <Input id={f("deposit")} name="deposit" inputMode="decimal" defaultValue={current?.finance?.depositPercent !== undefined ? String(current.finance.depositPercent) : ""} />
            </div>
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-[13px] font-medium">Return on investment</legend>
            {ROI_FIELDS.map(([key, label, placeholder]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={f(`roi-${key}`)}>{label}</Label>
                <Input id={f(`roi-${key}`)} name={`roi_${key}`} defaultValue={roiDefault[key]} placeholder={placeholder} />
              </div>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={saveSection.isPending}>Save calculator figures</Button>
            {current ? (
              <Button
                type="button"
                variant="ghost"
                disabled={saveSection.isPending}
                onClick={() => saveSection.mutate({ id: section.id, patch: { settings: writeTradeCalculator(section.settings, null) } })}
              >
                Remove all
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
