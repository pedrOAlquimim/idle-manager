export interface SparklineShape {
  line: string;
  area: string;
  last: { x: number; y: number } | null;
}

// The drawing of a small usage chart: the points of the line, of the filled area under it, and the last
// point. The series scales between its own lowest value and the higher of its peak and `ceiling`, so a
// quiet series stays low instead of filling the chart with noise.
export function sparkline(values: readonly number[], width: number, height: number, ceiling = 0): SparklineShape {
  const series = values.filter(Number.isFinite);
  if (series.length === 0) return { line: '', area: '', last: null };

  const low = Math.min(...series);
  const high = Math.max(ceiling, ...series);
  const span = high - low || 1;
  const points = series.map((value, index) => ({
    x: series.length === 1 ? width : (index / (series.length - 1)) * width,
    y: height - 4 - ((value - low) / span) * (height - 10),
  }));
  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  return { line, area: `0,${height} ${line} ${width},${height}`, last: points[points.length - 1] ?? null };
}
