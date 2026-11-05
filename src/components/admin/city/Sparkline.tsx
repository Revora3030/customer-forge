/** Tiny bars for a recorded series. An all-zero series says so instead of drawing a flat line. */
export function Sparkline({
  values,
  label,
  unit = "hours",
}: {
  values: readonly number[];
  label: string;
  /** Bucket size shown in empty copy and the peak aria-label. Defaults to hours (city throughput). */
  unit?: "hours" | "days";
}) {
  const peak = Math.max(...values, 0);
  const unitLabel = unit === "days" ? "day" : "hour";
  if (!peak) {
    return (
      <p className="text-[11px] text-muted-foreground">
        No records in the last {values.length} {unit}.
      </p>
    );
  }
  const width = 100 / values.length;
  return (
    <svg
      viewBox="0 0 100 24"
      role="img"
      aria-label={`${label}: peak ${peak} per ${unitLabel}`}
      className="h-8 w-full"
      preserveAspectRatio="none"
    >
      {values.map((value, index) => {
        const height = value ? Math.max(2, (value / peak) * 22) : 0.6;
        return (
          <rect
            key={index}
            x={index * width + 0.4}
            y={24 - height}
            width={Math.max(0.5, width - 0.8)}
            height={height}
            rx={0.4}
            className={value ? "fill-gold" : "fill-border"}
          />
        );
      })}
    </svg>
  );
}
