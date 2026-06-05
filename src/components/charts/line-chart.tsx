import { formatWeight } from "@/lib/format";

type Point = { label: string; value: number };

// Lightweight hand-rolled SVG line chart — no charting dependency, consistent
// with the existing hand-rolled ProgressRing. Renders responsively via viewBox.
export function LineChart({ data }: { data: Point[] }) {
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

  const x = (i: number) =>
    data.length === 1
      ? pad.l + innerW / 2
      : pad.l + (innerW * i) / (data.length - 1);
  const y = (v: number) => pad.t + innerH * (1 - (v - min) / (max - min));

  const linePoints = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");

  return (
    <div className="text-primary">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Top set weight over time"
      >
        {/* y-axis gridlines + labels (max / min) */}
        {[max, min].map((v) => (
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
              {formatWeight(v)}
            </text>
          </g>
        ))}

        {data.length > 1 && (
          <polyline
            points={linePoints}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {data.map((d, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(d.value)}
            r={3.5}
            fill="currentColor"
          />
        ))}

        {/* x labels: first & last */}
        <text
          x={x(0)}
          y={H - 6}
          textAnchor="start"
          className="fill-muted-foreground"
          fontSize={9}
        >
          {data[0].label}
        </text>
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
