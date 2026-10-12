import { useMemo } from "react";
import { encode } from "uqr";

type QrCodeProps = {
  // What the code says: an address, read by a phone's camera.
  text: string;
  // What it is, said to a reader who does not see it.
  label: string;
  className?: string;
};

/**
 * A text as a code that a camera reads, drawn as one path. It is dark on white whatever the
 * theme: a camera reads the contrast, and a code that follows a dark theme reads badly.
 */
export function QrCode({ text, label, className }: QrCodeProps) {
  const { size, path } = useMemo(() => {
    // The quiet zone around the code is part of what a camera needs.
    const code = encode(text, { ecc: "M", border: 2 });
    let drawn = "";
    code.data.forEach((row, y) => {
      row.forEach((isDark, x) => {
        if (isDark) drawn += `M${x} ${y}h1v1h-1z`;
      });
    });
    return { size: code.size, path: drawn };
  }, [text]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
