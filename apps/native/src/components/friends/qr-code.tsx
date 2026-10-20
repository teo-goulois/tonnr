import { useMemo } from "react";
import Svg, { Path, Rect } from "react-native-svg";

import { qrPath } from "./friend-words";

/**
 * A text as a code that a camera reads, as the web's `QrCode` draws it: one path, so that two
 * squares side by side leave no seam between them. It is dark on white whatever the theme: a
 * camera reads the contrast, and a code that follows a dark theme reads badly. A screen reader
 * hears what it is, not the squares.
 */
export function QrCode({ text, label, size }: { text: string; label: string; size: number }) {
  const code = useMemo(() => qrPath(text), [text]);
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${code.size} ${code.size}`}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <Rect width={code.size} height={code.size} fill="#fff" />
      <Path d={code.path} fill="#000" />
    </Svg>
  );
}
