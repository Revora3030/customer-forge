import { Switch } from "@/components/ui/switch";

/** Test/QA records are hidden by default. This only changes the view; no data is touched. */
export function ShowTestRecordsToggle({
  checked,
  onCheckedChange,
  hiddenCount,
  id = "show-test-records",
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  /** How many test/QA records the default view leaves out. */
  hiddenCount: number;
  id?: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} aria-label="Show test records" />
      <span>
        Show test records
        {!checked && hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}
      </span>
    </label>
  );
}
