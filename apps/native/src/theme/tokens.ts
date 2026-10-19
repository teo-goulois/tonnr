// Written by packages/ui/scripts/native-theme.mjs from packages/ui/src/styles/globals.css.
// Do not edit: change the theme there, then run `pnpm --filter @repo/ui run native-theme`.
// Decision 069.

export const light = {
  "color-1": "#262626",
  "color-1-transparent": "#26262633",
  "color-2": "#707070",
  "color-2-transparent": "#70707033",
  "color-3": "#b6b6b6",
  "color-3-transparent": "#b6b6b633",
  "color-4": "#e8e8e8",
  "color-4-transparent": "#e8e8e833",
  "neutral-1": "#ffffff",
  "neutral-1-transparent": "#ffffff33",
  "neutral-2": "#fafafa",
  "neutral-2-transparent": "#fafafa33",
  "neutral-3": "#f0f0f0",
  "neutral-3-transparent": "#f0f0f033",
  "neutral-4": "#dedede",
  "neutral-4-transparent": "#dedede33",
  "neutral-5": "#c5c5c5",
  "neutral-5-transparent": "#c5c5c533",
  "neutral-6": "#969696",
  "neutral-6-transparent": "#96969633",
  "neutral-7": "#6c6c6c",
  "neutral-7-transparent": "#6c6c6c33",
  "neutral-8": "#454545",
  "neutral-8-transparent": "#45454533",
  "neutral-9": "#252525",
  "neutral-9-transparent": "#25252533",
  "neutral-10": "#000000",
  "neutral-10-transparent": "#00000033",
  "success": "#76ef6b",
  "success-transparent": "#76ef6b33",
  "warning": "#ffa344",
  "warning-transparent": "#ffa34433",
  "error": "#ff5263",
  "error-transparent": "#ff526333",
  "cte-canvas": "#ffffff",
  "cte-surface": "#fafafa",
  "cte-surface-muted": "#f0f0f0",
  "cte-text": "#000000",
  "cte-text-muted": "#6c6c6c",
  "cte-border": "rgb(0 0 0 / 0.1)",
  "cte-accent": "#262626",
  "cte-accent-text": "#fafafa",
  "cte-danger": "#ff5263",
  "cte-focus": "#262626",
  "option-badge-foreground": "#262626",
  "navigation-active-foreground": "#fafafa",
  "emphasis-chart-fill": "#26262633"
} as const;

export const dark = {
  "color-1": "#e5e5e5",
  "color-1-transparent": "#e5e5e533",
  "color-2": "#b1b1b1",
  "color-2-transparent": "#b1b1b133",
  "color-3": "#777777",
  "color-3-transparent": "#77777733",
  "color-4": "#424242",
  "color-4-transparent": "#42424233",
  "neutral-1": "#000000",
  "neutral-1-transparent": "#00000033",
  "neutral-2": "#202020",
  "neutral-2-transparent": "#20202033",
  "neutral-3": "#2b2b2b",
  "neutral-3-transparent": "#2b2b2b33",
  "neutral-4": "#383838",
  "neutral-4-transparent": "#38383833",
  "neutral-5": "#505050",
  "neutral-5-transparent": "#50505033",
  "neutral-6": "#777777",
  "neutral-6-transparent": "#77777733",
  "neutral-7": "#a3a3a3",
  "neutral-7-transparent": "#a3a3a333",
  "neutral-8": "#c6c6c6",
  "neutral-8-transparent": "#c6c6c633",
  "neutral-9": "#e5e5e5",
  "neutral-9-transparent": "#e5e5e533",
  "neutral-10": "#ffffff",
  "neutral-10-transparent": "#ffffff33",
  "success": "#76ef6b",
  "success-transparent": "#76ef6b33",
  "warning": "#ffa344",
  "warning-transparent": "#ffa34433",
  "error": "#ff5263",
  "error-transparent": "#ff526333",
  "cte-canvas": "#000000",
  "cte-surface": "#202020",
  "cte-surface-muted": "#2b2b2b",
  "cte-text": "#ffffff",
  "cte-text-muted": "#a3a3a3",
  "cte-border": "rgb(0 0 0 / 0.1)",
  "cte-accent": "#e5e5e5",
  "cte-accent-text": "#202020",
  "cte-danger": "#ff5263",
  "cte-focus": "#e5e5e5",
  "option-badge-foreground": "#e5e5e5",
  "navigation-active-foreground": "#202020",
  "emphasis-chart-fill": "#e5e5e533"
} as const satisfies Record<keyof typeof light, string>;

export type ThemeColors = { readonly [Name in keyof typeof light]: string };

export const space = {
  "xxs": 4,
  "xs": 8,
  "s": 13,
  "m": 17,
  "l": 25,
  "xl": 33,
  "xxl": 50
} as const;

export const type = {
  "xxs": {
    "size": 9,
    "line": 13
  },
  "xs": {
    "size": 11,
    "line": 15
  },
  "s": {
    "size": 13,
    "line": 19
  },
  "m": {
    "size": 15,
    "line": 23
  },
  "l": {
    "size": 23,
    "line": 31
  },
  "xl": {
    "size": 35,
    "line": 38
  },
  "xxl": {
    "size": 46,
    "line": 50
  }
} as const;

export const radius = {
  "xs": 18,
  "s": 28,
  "m": 42,
  "l": 50,
  "xl": 36
} as const;

export const motion = {
  "duration": 160,
  "easing": [
    0.16,
    1,
    0.3,
    1
  ],
  "largeDuration": 280,
  "largeEasing": [
    0.16,
    1,
    0.3,
    1
  ],
  "popupScale": 0.96,
  "bounce": 0.2,
  "largeBounce": 0.3
} as const;
