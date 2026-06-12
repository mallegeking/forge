import { formatWeight } from "@/lib/format";

type WeekPoint = { value: number };

// The Ember bodyweight chart: weekly averages as a single accent line over
// three faint gridlines, endpoint marked with a dot + halo ring. Pure SVG,
// server-renderable (no client JS). X labels show first / middle / last week
// as "W1 · 84.2".
export function BodyweightChart({ points }: { points: WeekPoint[] }) {
  const W = 326;
  const H = 130;
  const padX = 8;
  const padY = 16;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const x = (i: number) =>
    points.length === 1
      ? W / 2
      : padX + ((W - 2 * padX) * i) / (points.length - 1);
  const y = (v: number) => padY + (H - 2 * padY) * (1 - (v - min) / (max - min));

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");
  const lastX = x(points.length - 1);
  const lastY = y(points[points.length - 1].value);

  // First / middle / last week labels (deduped when fewer than 3 weeks).
  const idx = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-2.5 block h-[130px] w-full"
        role="img"
        aria-hidden="true"
      >
        {[32, 64, 96].map((gy) => (
          <line
            key={gy}
            x1="0"
            y1={gy}
            x2={W}
            y2={gy}
            stroke="rgba(244,239,232,0.06)"
            strokeWidth="1"
          />
        ))}
        {points.length > 1 && (
          <path
            d={path}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        <circle cx={lastX} cy={lastY} r="4.5" fill="var(--primary)" />
        <circle
          cx={lastX}
          cy={lastY}
          r="9"
          fill="none"
          stroke="rgba(255,90,31,0.35)"
          strokeWidth="2"
        />
      </svg>
      <div className="mt-2 flex justify-between">
        {idx.map((i, n) => (
          <span
            key={i}
            className={`text-[9px] tracking-[0.12em] ${
              n === idx.length - 1 ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            W{i + 1} · {formatWeight(points[i].value)}
          </span>
        ))}
      </div>
    </div>
  );
}
