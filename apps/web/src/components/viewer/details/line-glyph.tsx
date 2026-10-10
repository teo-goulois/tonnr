/** The buoy's line or the model's, as the lanes draw them, before a figure it tells apart. */
export function LineGlyph({ dashed = false, color }: { dashed?: boolean; color?: string }) {
  return (
    <svg width={14} height={6} aria-hidden className="shrink-0 text-neutral-8">
      <line
        x1={1}
        x2={13}
        y1={3}
        y2={3}
        stroke={color ?? "currentColor"}
        strokeLinecap="round"
        strokeWidth={dashed ? 1.5 : 2.5}
        strokeDasharray={dashed ? "3 3" : undefined}
      />
    </svg>
  );
}
