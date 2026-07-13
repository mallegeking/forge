import { formatWeight } from "@/lib/format";

type Point = {
  label: string;
  value: number;
  /** Draw a hollow marker — a planned deload, not a real dip. */
  muted?: boolean;
};

/** Largest "nice" step (1/2/2.5/5 × 10ⁿ) that is ≤ raw. */
function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const c of [10, 5, 2.5, 2, 1]) {
    if (c * pow <= raw) return c * pow;
  }
  return pow;
}

// Lightweight hand-rolled SVG line chart — no charting dependency, consistent
// with the existing hand-rolled ProgressRing. Renders responsively via viewBox.
// The y-domain snaps outward to clean numbers so the three gridline labels read
// as round values instead of exact data min/max.
export function LineChart({
  data,
  ariaLabel = "Top set weight over time",
  formatValue = formatWeight,
}: {
  data: Point[];
  ariaLabel?: string;
  /** Formats the y-axis tick + end-point labels. Defaults to weight (kg). */
  formatValue?: (value: number) => string;
}) {
  if (data.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No history yet — log a session to start the graph.
      </p>
    );
  }

  const W = 320;
  const H = 150;
  const pad = { l: 36, r: 12, t: 14, b: 24 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const values = data.map((d) => d.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  // Clean-number domain: snap outward to a nice step sized for ~2 intervals.
  const step = niceStep((max - min) / 2);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const mid = (lo + hi) / 2;
  // Trim float noise from step arithmetic (0.30000000000000004 → 0.3).
  const clean = (v: number) => Math.round(v * 1000) / 1000;

  const x = (i: number) =>
    data.length === 1
      ? pad.l + innerW / 2
      : pad.l + (innerW * i) / (data.length - 1);
  const y = (v: number) => pad.t + innerH * (1 - (v - lo) / (hi - lo));

  const linePoints = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const baselineY = pad.t + innerH;
  const areaPoints = `${linePoints} ${x(data.length - 1)},${baselineY} ${x(0)},${baselineY}`;

  // Markers stay legible on dense series: past 12 points only the endpoints,
  // the extremes and muted (deload) points get a dot; the line carries the rest.
  const markerIdx = new Set(
    data.length > 12
      ? [
          0,
          data.length - 1,
          values.indexOf(max),
          values.indexOf(min),
          ...data.flatMap((d, i) => (d.muted ? [i] : [])),
        ]
      : data.map((_, i) => i)
  );

  const last = data[data.length - 1];
  // End label sits opposite the plot's crowded half so it never crosses the line.
  const lastAbove = y(last.value) >= pad.t + innerH / 2;

  return (
    <div className="text-primary">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={ariaLabel}
      >
        {/* y-axis gridlines + labels (clean max / mid / min) */}
        {[hi, mid, lo].map((v) => (
          <g key={v}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(v)}
              y2={y(v)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={pad.l - 6}
              y={y(v) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize={9}
            >
              {formatValue(clean(v))}
            </text>
          </g>
        ))}

        {data.length > 1 && (
          <>
            <polygon points={areaPoints} fill="currentColor" fillOpacity={0.1} />
            <polyline
              points={linePoints}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}

        {data.map((d, i) =>
          markerIdx.has(i) ? (
            <circle
              key={i}
              cx={x(i)}
              cy={y(d.value)}
              r={4}
              // Muted (deload) points invert: hollow ring instead of solid dot.
              fill={d.muted ? "var(--card)" : "currentColor"}
              stroke={d.muted ? "currentColor" : "var(--card)"}
              strokeWidth={2}
            />
          ) : null
        )}

        {/* Direct label on the latest point — the "where am I now" number. */}
        <text
          x={x(data.length - 1) - 2}
          y={y(last.value) + (lastAbove ? -9 : 15)}
          textAnchor="end"
          className="fill-foreground"
          fontSize={10}
          fontWeight={600}
        >
          {formatValue(last.value)}
        </text>

        {/* x labels: first, middle (when enough points) & last */}
        <text
          x={x(0)}
          y={H - 6}
          textAnchor="start"
          className="fill-muted-foreground"
          fontSize={9}
        >
          {data[0].label}
        </text>
        {data.length >= 5 && (
          <text
            x={x(Math.floor((data.length - 1) / 2))}
            y={H - 6}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={9}
          >
            {data[Math.floor((data.length - 1) / 2)].label}
          </text>
        )}
        {data.length > 1 && (
          <text
            x={x(data.length - 1)}
            y={H - 6}
            textAnchor="end"
            className="fill-muted-foreground"
            fontSize={9}
          >
            {data[data.length - 1].label}
          </text>
        )}
      </svg>
    </div>
  );
}
