// Writes the theme of the app for phones from the web's, so that each value of the Tonnr theme
// stays in one place, `packages/ui/src/styles/globals.css`: a stylesheet that Uniwind reads, with
// the names HeroUI Native reads, and a module of the same values for what a stylesheet cannot
// reach (a chart, a map, a widget). `--check` writes nothing and fails when either is stale.
// Decision 069.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "../src/styles/globals.css");
const out = join(here, "../../../apps/native/src/theme");
const cssFile = join(out, "tonnr.css");
const tsFile = join(out, "tokens.ts");

const css = readFileSync(source, "utf8");

/** The declarations of the first block that opens with `opening`, as a map of name to value. */
function block(opening) {
  const start = css.indexOf(opening);
  if (start === -1) throw new Error(`${opening} is not in globals.css`);
  const open = css.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (; end < css.length; end++) {
    if (css[end] === "{") depth++;
    if (css[end] === "}" && --depth === 0) break;
  }
  const body = css.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const values = new Map();
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    values.set(name, value.trim());
  }
  return values;
}

const root = block(":root {");
const dark = new Map([...root, ...block(".dark {")]);
const theme = block("@theme {");

/** A value with every `var(--x)` it names resolved in `values`. */
function resolve(value, values, seen = new Set()) {
  return value.replace(/var\(--([\w-]+)\)/g, (_, name) => {
    if (seen.has(name)) throw new Error(`--${name} names itself`);
    const found = values.get(name);
    if (found === undefined) throw new Error(`--${name} has no value`);
    return resolve(found, values, new Set([...seen, name]));
  });
}

// The colors of the theme, in light and in dark, as hex or rgb.
const COLOR_NAMES = [
  ...["1", "2", "3", "4"].flatMap((n) => [`color-${n}`, `color-${n}-transparent`]),
  ...Array.from({ length: 10 }, (_, i) => [
    `neutral-${i + 1}`,
    `neutral-${i + 1}-transparent`,
  ]).flat(),
  ...["success", "warning", "error"].flatMap((n) => [n, `${n}-transparent`]),
  "cte-canvas",
  "cte-surface",
  "cte-surface-muted",
  "cte-text",
  "cte-text-muted",
  "cte-border",
  "cte-accent",
  "cte-accent-text",
  "cte-danger",
  "cte-focus",
  "option-badge-foreground",
  "navigation-active-foreground",
  "emphasis-chart-fill",
];

function colors(values) {
  return Object.fromEntries(COLOR_NAMES.map((name) => [name, resolve(values.get(name), values)]));
}

const light = colors(root);
const night = colors(dark);

// What HeroUI Native reads, in its own words, from the theme's: decision 014's one file that
// maps the names.
function heroui(c) {
  return {
    background: c["cte-canvas"],
    foreground: c["cte-text"],
    surface: c["cte-surface"],
    "surface-foreground": c["cte-text"],
    "surface-secondary": c["cte-surface-muted"],
    "surface-secondary-foreground": c["cte-text"],
    "surface-tertiary": c["neutral-4"],
    "surface-tertiary-foreground": c["cte-text"],
    overlay: c["neutral-1"],
    "overlay-foreground": c["cte-text"],
    backdrop: "rgb(0 0 0 / 0.2)",
    muted: c["cte-text-muted"],
    default: c["neutral-3"],
    "default-foreground": c["cte-text"],
    accent: c["cte-accent"],
    "accent-foreground": c["cte-accent-text"],
    "field-background": c["neutral-1"],
    "field-foreground": c["cte-text"],
    "field-placeholder": c["cte-text-muted"],
    "field-border": c["neutral-4"],
    success: c.success,
    "success-foreground": c["neutral-10"],
    warning: c.warning,
    "warning-foreground": c["neutral-10"],
    danger: c.error,
    "danger-foreground": c["neutral-1"],
    segment: c["neutral-1"],
    "segment-foreground": c["cte-text"],
    border: c["neutral-4"],
    separator: c["neutral-4"],
    focus: c["cte-focus"],
    link: c["cte-text"],
    "surface-shadow": "0 0 0 0 transparent",
    "overlay-shadow": "0 0 0 0 transparent",
    "field-shadow": "0 0 0 0 transparent",
  };
}

const px = (value) => {
  const found = /^(-?[\d.]+)px$/.exec(value);
  if (!found) throw new Error(`${value} is not in pixels`);
  return Number(found[1]);
};
const STEPS = ["xxs", "xs", "s", "m", "l", "xl", "xxl"];
const space = Object.fromEntries(STEPS.map((step) => [step, px(root.get(`space-${step}`))]));
const type = Object.fromEntries(
  STEPS.map((step) => [
    step,
    { size: px(root.get(`size-${step}`)), line: px(root.get(`line-${step}`)) },
  ]),
);
const RADII = ["xs", "s", "m", "l", "xl"];
const radius = Object.fromEntries(RADII.map((step) => [step, px(theme.get(`radius-${step}`))]));
const bezier = (value) => {
  const found = /cubic-bezier\(([^)]+)\)/.exec(value);
  if (!found) throw new Error(`${value} is not a cubic-bezier`);
  return found[1].split(",").map(Number);
};
// The widths of an edge, which the web draws as a shadow: `edge` there, `edge` in the app.
const border = Object.fromEntries(
  ["s", "m", "l"].map((step) => [step, px(root.get(`border-${step}`))]),
);
// Geist, which the web reads as one variable font: a phone names one file per weight, as
// `assets/fonts` holds them, for each weight the theme names (`--weight-ui-*`), and the mono
// one for figures (`--font-data`).
const fonts = {
  regular: "Geist-Regular",
  medium: "Geist-Medium",
  heavy: "Geist-Bold",
  data: "GeistMono-Regular",
};
const motion = {
  duration: Number.parseInt(root.get("motion-duration"), 10),
  easing: bezier(root.get("motion-easing")),
  largeDuration: Number.parseInt(root.get("motion-large-duration"), 10),
  largeEasing: bezier(root.get("motion-large-easing")),
  popupScale: Number(root.get("motion-popup-scale")),
  bounce: Number(root.get("motion-bounce")),
  largeBounce: Number(root.get("motion-large-bounce")),
};

const declare = (entries, indent) =>
  Object.entries(entries)
    .map(([name, value]) => `${indent}--${name}: ${value};`)
    .join("\n");

const HEADER =
  "Written by packages/ui/scripts/native-theme.mjs from packages/ui/src/styles/globals.css.\n" +
  "Do not edit: change the theme there, then run `pnpm --filter @repo/ui run native-theme`.";

const stylesheet = `/* ${HEADER} */

@theme {
  /* The steps of the theme, as the web app spells them. */
${STEPS.map((step) => `  --spacing-${step}: ${space[step]}px;`).join("\n")}
${STEPS.map((step) => `  --text-${step}: ${type[step].size}px;\n  --text-${step}--line-height: ${type[step].line}px;`).join("\n")}
${RADII.map((step) => `  --radius-${step}: ${radius[step]}px;`).join("\n")}
  /* The names HeroUI Native's components use, on the theme's scale, as the web maps shadcn's. */
  --radius-sm: ${radius.xs}px;
  --radius-md: ${radius.xs}px;
  --radius-lg: ${radius.s}px;
  --radius-2xl: ${radius.m}px;
  --radius-3xl: ${radius.m}px;
  --radius-4xl: ${radius.l}px;
  --field-radius: ${radius.xs}px;
  --border-width: ${border.s}px;
  --font-normal: "${fonts.regular}";
  --font-medium: "${fonts.medium}";
  --font-semibold: "${fonts.medium}";
  --font-bold: "${fonts.heavy}";
  --font-mono: "${fonts.data}";
}

@layer theme {
  :root {
    @variant light {
${declare(light, "      ")}
${declare(heroui(light), "      ")}
    }

    @variant dark {
${declare(night, "      ")}
${declare(heroui(night), "      ")}
    }
  }
}

@theme inline static {
${COLOR_NAMES.filter(
  (name) =>
    !name.startsWith("cte-") && !name.includes("-foreground") && name !== "emphasis-chart-fill",
)
  .map((name) => `  --color-${name}: var(--${name});`)
  .join("\n")}
}
`;

const module = `// ${HEADER.replace("\n", "\n// ")}
// Decision 069.

export const light = ${JSON.stringify(light, null, 2)} as const;

export const dark = ${JSON.stringify(night, null, 2)} as const satisfies Record<keyof typeof light, string>;

export type ThemeColors = { readonly [Name in keyof typeof light]: string };

export const space = ${JSON.stringify(space, null, 2)} as const;

export const type = ${JSON.stringify(type, null, 2)} as const;

export const radius = ${JSON.stringify(radius, null, 2)} as const;

export const border = ${JSON.stringify(border, null, 2)} as const;

export const fonts = ${JSON.stringify(fonts, null, 2)} as const;

export const motion = ${JSON.stringify(motion, null, 2)} as const;
`;

const check = process.argv.includes("--check");
let stale = false;
for (const [file, text] of [
  [cssFile, stylesheet],
  [tsFile, module],
]) {
  let current = null;
  try {
    current = readFileSync(file, "utf8");
  } catch {
    /* Not written yet. */
  }
  if (current === text) continue;
  if (check) {
    console.error(`${file} is stale: run pnpm --filter @repo/ui run native-theme`);
    stale = true;
  } else {
    writeFileSync(file, text);
    console.log(`wrote ${file}`);
  }
}
if (stale) process.exit(1);
