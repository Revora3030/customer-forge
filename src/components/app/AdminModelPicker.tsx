import { JarvisModelPicker } from "@/components/app/jarvis/JarvisModelPicker";

/** Super-admin only: lead with one Lovable model; the rest stay as backup. */
export function AdminModelPicker({ value, onChange }: { value: string | null; onChange: (model: string | null) => void }) {
  return (
    <JarvisModelPicker
      value={value}
      onChange={onChange}
      label="Model (admin)"
      className="mb-2"
      selectClassName="h-9 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}
