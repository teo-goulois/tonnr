import { createCn } from "cn/config";

// The theme names its sizes of type itself: `text-s`, `text-m`. The merge knows Tailwind's own
// names and takes any other `text-…` for a color of text, so a size and a color given together
// each took the other's place: a small button lost the color of its label, and a label its size.
// Named here, the theme's sizes are sizes.
export const cn = createCn({
  extend: {
    classGroups: { "font-size": [{ text: ["xxs", "xs", "s", "m", "l", "xl", "xxl"] }] },
  },
});
