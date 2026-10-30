/** Records per hour as tiny bars. Presents recorded counts only; an all-zero series says so instead of drawing a flat line. */
export function Sparkline({ values, label }: { values: readonly number[]; label: string }) {
  const peak = Math.max(...values, 0);
  if (!peak) return <p className="text-[11px] text-muted-foreground">No records in the last {values.length} hours.</p>;
  const width = 100 / values.length;
  return (
    <svg viewBox="0 0 100 24" role="img" aria-label={`${label}: peak ${peak} per hour`} className="h-8 w-full" preserveAspectRatio="none">
      {values.map((value, index) => {
        const height = value ? Math.max(2, (value / peak) * 22) : 0.6;
        return <rect key={index} x={index * width + 0.4} y={24 - height} width={Math.max(0.5, width - 0.8)} height={height} rx={0.4} className={value ? "fill-gold" : "fill-border"} />;
      })}
    </svg>
  );
}
