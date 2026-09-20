/**
 * Trusted renderer for generated decorative artwork.
 *
 * It draws only from a validated data spec — there is no markup, HTML string,
 * URL or script anywhere in the path, so nothing a model produces can execute.
 * Colours come from the site's own design tokens, so the artwork always matches
 * the website's palette. It is purely decorative and hidden from screen readers.
 */
import type { ArtLayer, ArtworkSpec } from "@/lib/media/generative-art";

const TONE_VAR: Record<ArtLayer["tone"], string> = {
  primary: "var(--primary)",
  accent: "var(--accent)",
  secondary: "var(--secondary)",
};

function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function Layer({ layer, index }: { layer: ArtLayer; index: number }) {
  const x = clamp(layer.x, -20, 120);
  const y = clamp(layer.y, -20, 120);
  const size = clamp(layer.size, 4, 120);
  const opacity = clamp(layer.opacity, 0.02, 0.45);
  const stroke = clamp(layer.stroke ?? 2, 0.5, 6);
  const repeat = Math.round(clamp(layer.repeat ?? 3, 1, 90));
  const color = TONE_VAR[layer.tone] ?? TONE_VAR.primary;
  const transform = `rotate(${clamp(layer.rotate, 0, 360)} ${x} ${y})`;

  switch (layer.kind) {
    case "blob":
      return (
        <ellipse
          cx={x}
          cy={y}
          rx={size / 2}
          ry={size / 2.6}
          fill={color}
          opacity={opacity}
          transform={transform}
        />
      );
    case "ring":
      return (
        <circle cx={x} cy={y} r={size / 2} fill="none" stroke={color} strokeWidth={stroke} opacity={opacity} />
      );
    case "arc":
      return (
        <path
          d={`M ${x - size / 2} ${y} A ${size / 2} ${size / 2} 0 0 1 ${x + size / 2} ${y}`}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          opacity={opacity}
          transform={transform}
        />
      );
    case "wave":
      return (
        <path
          d={`M -10 ${y} Q ${x / 2} ${y - size / 4} ${x} ${y} T ${x + size} ${y} T 130 ${y}`}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          opacity={opacity}
        />
      );
    case "rays":
      return (
        <g opacity={opacity} transform={transform}>
          {Array.from({ length: 12 }).map((_, ray) => (
            <line
              key={ray}
              x1={x}
              y1={y}
              x2={x + Math.cos((ray / 12) * Math.PI * 2) * size}
              y2={y + Math.sin((ray / 12) * Math.PI * 2) * size}
              stroke={color}
              strokeWidth={stroke / 2}
            />
          ))}
        </g>
      );
    case "bar":
      return (
        <g opacity={opacity} transform={transform}>
          {Array.from({ length: repeat }).map((_, bar) => (
            <rect
              key={bar}
              x={x}
              y={y + bar * (size / repeat)}
              width={size}
              height={Math.max(0.8, size / (repeat * 3))}
              rx={0.6}
              fill={color}
            />
          ))}
        </g>
      );
    case "tile":
      return (
        <g opacity={opacity} transform={transform}>
          {Array.from({ length: repeat }).map((_, tile) => (
            <rect
              key={tile}
              x={x + tile * (size / repeat) * 0.8}
              y={y - tile * 2}
              width={size / repeat}
              height={size / repeat}
              rx={size / (repeat * 6)}
              fill={color}
            />
          ))}
        </g>
      );
    case "dots":
      return (
        <g opacity={opacity}>
          {Array.from({ length: repeat }).map((_, dot) => {
            const columns = 10;
            return (
              <circle
                key={dot}
                cx={((dot % columns) + 0.5) * 10}
                cy={(Math.floor(dot / columns) + 0.5) * 10}
                r={Math.max(0.4, size / 80)}
                fill={color}
              />
            );
          })}
        </g>
      );
    default:
      return <g key={index} />;
  }
}

function Wash({ wash, id }: { wash: ArtworkSpec["wash"]; id: string }) {
  if (wash === "none") return null;
  if (wash === "radial" || wash === "mesh") {
    return (
      <>
        <defs>
          <radialGradient id={id} cx="50%" cy="35%" r="75%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill={`url(#${id})`} />
      </>
    );
  }
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity={wash === "dual" ? "0.18" : "0.12"} />
          <stop offset="100%" stopColor={wash === "dual" ? "var(--accent)" : "var(--primary)"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill={`url(#${id})`} />
    </>
  );
}

export function DecorativeArt({
  spec,
  className,
}: {
  spec: ArtworkSpec;
  className?: string;
}) {
  if (!spec || !Array.isArray(spec.layers)) return null;
  if (spec.wash === "none" && spec.layers.length === 0) return null;
  const washId = `rv-wash-${spec.seed.toString(36)}-${spec.system.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg
      className={className ?? "h-full w-full"}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <Wash wash={spec.wash} id={washId} />
      {spec.layers.slice(0, 8).map((layer, index) => (
        <Layer key={`${layer.kind}-${index}`} layer={layer} index={index} />
      ))}
    </svg>
  );
}
