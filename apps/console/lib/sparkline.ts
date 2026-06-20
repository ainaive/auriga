// Map a value series to SVG polyline points (pure; unit-tested). Keeps the
// console chart-library-free — a sparkline is just an inline <svg>.

export function sparklinePoints(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 0);
  const dx = values.length === 1 ? 0 : width / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * dx;
      const y = max === 0 ? height : height - (v / max) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
