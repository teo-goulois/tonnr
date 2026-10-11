/**
 * A line as a chart draws it, before the figure it tells apart: the buoy's bold one, the
 * model's dashed one, or the thin one of the gusts.
 */
export function LineGlyph({
  dashed = false,
  thin = false,
  color,
}: {
  dashed?: boolean;
  thin?: boolean;
  color?: string;
}) {
  return (
    <svg width={14} height={6} aria-hidden className="shrink-0 text-neutral-8">
      <line
        x1={1}
        x2={13}
        y1={3}
        y2={3}
        stroke={color ?? "currentColor"}
        strokeLinecap="round"
        strokeWidth={dashed ? 1.5 : thin ? 1.25 : 2.5}
        strokeDasharray={dashed ? "3 3" : undefined}
      />
    </svg>
  );
}
