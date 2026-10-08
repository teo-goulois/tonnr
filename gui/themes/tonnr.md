# tonnr

Generated from the current project, including edits awaiting autosave. Return to the [theme index](../themes.md). Install the selected fonts and icons using the setup below; assets are acquired separately from their official sources.

## Font and icon setup

Follow [asset installation](../assets.md) when implementing this theme. Download and configure the selected free assets from their official sources; no font files or icon artwork are bundled. Weights below are the authored requests: load matching static faces or a variable range and report any unavailable weight. Register the exact family aliases below, or map the role tokens to the loader’s actual family.

| Selected font | Roles | Weights | Family stack | Setup |
| --- | --- | --- | --- | --- |
| <code>Geist</code> (free) | brand, ui, editorial | 400, 500, 700 | <code>"Sidebar Geist", sans-serif</code> | Download and load [Geist](https://vercel.com/font) in the app. |
| <code>Geist Mono</code> (free) | data | 400, 500, 700 | <code>"Sidebar Geist Mono", monospace</code> | Download and load [Geist Mono](https://vercel.com/font) in the app. |

### Icons

Selected: [Central](https://iconists.co/central), outlined. Use the user’s licensed Central artwork if supplied under the [vendor license](https://iconists.co/license). Otherwise install [Lucide](https://lucide.dev/guide/react/getting-started) (React: <code>lucide-react</code>) and wire it into the app’s icon adapter. Tell the user that Lucide is active and that they can license Central at the vendor link, add its files to the app’s icon asset location, and update that adapter to restore Central.

Preserve icon size, color, weight, style, and accessible names. Match the selected style only where the pack supports it; Lucide’s official pack supplies outlines, so report a filled-style gap rather than claiming exact filled artwork. Keep existing package versions and add only missing packages using the receiving project’s package manager.

## Foundations

```json
{
  "name": "tonnr",
  "animation": {
    "duration": 160,
    "easing": [
      0.16,
      1,
      0.3,
      1
    ],
    "large": {
      "type": "easing",
      "duration": 280,
      "easing": [
        0.16,
        1,
        0.3,
        1
      ],
      "visualDuration": 0.36,
      "bounce": 0.3
    },
    "popupScale": 0.96,
    "pressDistance": 1,
    "type": "easing",
    "visualDuration": 0.2,
    "bounce": 0.2
  },
  "spacing": {
    "zero": 0,
    "xxs": 4,
    "xs": 8,
    "s": 13,
    "m": 17,
    "l": 25,
    "xl": 33,
    "xxl": 50
  },
  "text": {
    "xxs": {
      "size": 9,
      "lineHeight": 13,
      "letterSpacing": 0
    },
    "xs": {
      "size": 11,
      "lineHeight": 15,
      "letterSpacing": 0
    },
    "s": {
      "size": 13,
      "lineHeight": 19,
      "letterSpacing": 0
    },
    "m": {
      "size": 15,
      "lineHeight": 23,
      "letterSpacing": 0
    },
    "l": {
      "size": 23,
      "lineHeight": 31,
      "letterSpacing": 0
    },
    "xl": {
      "size": 35,
      "lineHeight": 38,
      "letterSpacing": 0
    },
    "xxl": {
      "size": 46,
      "lineHeight": 50,
      "letterSpacing": 0
    }
  },
  "fonts": {
    "ui": {
      "family": "\"Sidebar Geist\", sans-serif",
      "weights": {
        "regular": 400,
        "medium": 500,
        "heavy": 700
      }
    },
    "brand": {
      "family": "\"Sidebar Geist\", sans-serif",
      "weights": {
        "regular": 400,
        "medium": 500,
        "heavy": 700
      }
    },
    "editorial": {
      "family": "\"Sidebar Geist\", sans-serif",
      "weights": {
        "regular": 400,
        "medium": 500,
        "heavy": 700
      }
    },
    "data": {
      "family": "\"Sidebar Geist Mono\", monospace",
      "weights": {
        "regular": 400,
        "medium": 500,
        "heavy": 700
      }
    }
  },
  "radius": {
    "zero": 0,
    "xs": 18,
    "s": 28,
    "m": 42,
    "l": 50,
    "xl": 36,
    "full": 9999
  },
  "border": {
    "none": 0,
    "s": 0.5,
    "m": 1.5,
    "l": 2
  },
  "shadows": {
    "s": {
      "x": 0,
      "y": 1,
      "blur": 2,
      "spread": 0,
      "opacity": 0,
      "color": {
        "light": "neutral-10",
        "dark": "neutral-1"
      }
    },
    "m": {
      "x": 0,
      "y": 8,
      "blur": 24,
      "spread": 0,
      "opacity": 0,
      "color": {
        "light": "neutral-10",
        "dark": "neutral-1"
      }
    },
    "l": {
      "x": 0,
      "y": 12,
      "blur": 30,
      "spread": 0,
      "opacity": 0,
      "color": {
        "light": "neutral-10",
        "dark": "neutral-1"
      }
    }
  },
  "primaryForeground": {
    "light": "neutral-2",
    "dark": "neutral-2"
  },
  "iconFamily": "Central",
  "primaryActionColor": "color-1",
  "iconStyle": "outlined"
}
```

## light CSS variables

Define these in the app’s existing theme scope for this mode. Keep component styles linked to the variables.

| Variable | Value |
| --- | --- |
| `--theme-name` | tonnr |
| `--theme-icon-family` | Central |
| `--theme-icon-style` | outlined |
| `--toolbar-divider-bleed` | 1 |
| `--focus-ring-outline` | 2px solid color-mix(in srgb, #000000 50%, transparent) |
| `--icon-stroke-width` | 2 |
| `--icon-light-display` | none |
| `--icon-regular-display` | inline |
| `--icon-bold-display` | none |
| `--motion-duration` | 160ms |
| `--motion-easing` | cubic-bezier(0.16, 1, 0.3, 1) |
| `--motion-type` | easing |
| `--motion-visual-duration` | 0.16 |
| `--motion-bounce` | 0.2 |
| `--motion-enabled` | 1 |
| `--motion-small-iterations` | infinite |
| `--motion-large-duration` | 280ms |
| `--motion-large-easing` | cubic-bezier(0.16, 1, 0.3, 1) |
| `--motion-large-type` | easing |
| `--motion-large-visual-duration` | 0.28 |
| `--motion-large-bounce` | 0.3 |
| `--motion-large-iterations` | infinite |
| `--motion-popup-scale` | 0.96 |
| `--motion-press-distance` | 1px |
| `--option-badge-background` | color-mix(in srgb, var(--color-1) 10%, transparent) |
| `--option-badge-foreground` | #262626 |
| `--navigation-active-foreground` | #fafafa |
| `--emphasis-chart-fill` | #26262633 |
| `--surface-raised-image` | none |
| `--surface-raised-shadow` | 0 0 0 0 transparent |
| `--surface-recessed-image` | none |
| `--surface-recessed-shadow` | 0 0 0 0 transparent |
| `--space-zero` | 0px |
| `--space-xxs` | 4px |
| `--space-xs` | 8px |
| `--space-s` | 13px |
| `--space-m` | 17px |
| `--space-l` | 25px |
| `--space-xl` | 33px |
| `--space-xxl` | 50px |
| `--size-xxs` | 9px |
| `--line-xxs` | 13px |
| `--letter-spacing-xxs` | 0em |
| `--size-xs` | 11px |
| `--line-xs` | 15px |
| `--letter-spacing-xs` | 0em |
| `--size-s` | 13px |
| `--line-s` | 19px |
| `--letter-spacing-s` | 0em |
| `--size-m` | 15px |
| `--line-m` | 23px |
| `--letter-spacing-m` | 0em |
| `--size-l` | 23px |
| `--line-l` | 31px |
| `--letter-spacing-l` | 0em |
| `--size-xl` | 35px |
| `--line-xl` | 38px |
| `--letter-spacing-xl` | 0em |
| `--size-xxl` | 46px |
| `--line-xxl` | 50px |
| `--letter-spacing-xxl` | 0em |
| `--radius-zero` | 0px |
| `--radius-xs` | 18px |
| `--radius-s` | 28px |
| `--radius-m` | 42px |
| `--radius-l` | 50px |
| `--radius-xl` | 36px |
| `--radius-full` | 9999px |
| `--border-none` | 0px |
| `--border-s` | 0.5px |
| `--border-m` | 1.5px |
| `--border-l` | 2px |
| `--border-default-color` | rgb(0 0 0 / 0.1) |
| `--border-shadow-none` | 0 0 0 0 transparent |
| `--border-shadow-s` | 0 0 0 0.5px rgb(0 0 0 / 0.1) |
| `--border-shadow-m` | 0 0 0 1.5px rgb(0 0 0 / 0.1) |
| `--border-shadow-l` | 0 0 0 2px rgb(0 0 0 / 0.1) |
| `--font-ui` | "Sidebar Geist", sans-serif |
| `--weight-ui-regular` | 400 |
| `--weight-ui-medium` | 500 |
| `--weight-ui-heavy` | 700 |
| `--font-brand` | "Sidebar Geist", sans-serif |
| `--weight-brand-regular` | 400 |
| `--weight-brand-medium` | 500 |
| `--weight-brand-heavy` | 700 |
| `--font-editorial` | "Sidebar Geist", sans-serif |
| `--weight-editorial-regular` | 400 |
| `--weight-editorial-medium` | 500 |
| `--weight-editorial-heavy` | 700 |
| `--font-data` | "Sidebar Geist Mono", monospace |
| `--weight-data-regular` | 400 |
| `--weight-data-medium` | 500 |
| `--weight-data-heavy` | 700 |
| `--color-none` | transparent |
| `--color-1` | #262626 |
| `--color-1-transparent` | #26262633 |
| `--color-2` | #707070 |
| `--color-2-transparent` | #70707033 |
| `--color-3` | #b6b6b6 |
| `--color-3-transparent` | #b6b6b633 |
| `--color-4` | #e8e8e8 |
| `--color-4-transparent` | #e8e8e833 |
| `--neutral-1` | #ffffff |
| `--neutral-1-transparent` | #ffffff33 |
| `--neutral-2` | #fafafa |
| `--neutral-2-transparent` | #fafafa33 |
| `--neutral-3` | #f0f0f0 |
| `--neutral-3-transparent` | #f0f0f033 |
| `--neutral-4` | #dedede |
| `--neutral-4-transparent` | #dedede33 |
| `--neutral-5` | #c5c5c5 |
| `--neutral-5-transparent` | #c5c5c533 |
| `--neutral-6` | #969696 |
| `--neutral-6-transparent` | #96969633 |
| `--neutral-7` | #6c6c6c |
| `--neutral-7-transparent` | #6c6c6c33 |
| `--neutral-8` | #454545 |
| `--neutral-8-transparent` | #45454533 |
| `--neutral-9` | #252525 |
| `--neutral-9-transparent` | #25252533 |
| `--neutral-10` | #000000 |
| `--neutral-10-transparent` | #00000033 |
| `--success` | #76ef6b |
| `--success-transparent` | #76ef6b33 |
| `--warning` | #ffa344 |
| `--warning-transparent` | #ffa34433 |
| `--error` | #ff5263 |
| `--error-transparent` | #ff526333 |
| `--shadow-none` | none |
| `--shadow-s` | 0px 1px 2px 0px #00000000 |
| `--shadow-m` | 0px 8px 24px 0px #00000000 |
| `--shadow-l` | 0px 12px 30px 0px #00000000 |
| `--cte-canvas` | #ffffff |
| `--cte-surface` | #fafafa |
| `--cte-surface-muted` | #f0f0f0 |
| `--cte-text` | #000000 |
| `--cte-text-muted` | #6c6c6c |
| `--cte-border` | rgb(0 0 0 / 0.1) |
| `--cte-accent` | #262626 |
| `--cte-accent-text` | #fafafa |
| `--cte-danger` | #ff5263 |
| `--cte-focus` | #262626 |
| `--cte-font` | "Sidebar Geist", sans-serif |
| `--cte-font-size` | 15px |
| `--cte-font-weight` | 400 |
| `--cte-line-height` | 23px |
| `--cte-letter-spacing` | 0em |
| `--cte-detail-font-size` | 15px |
| `--cte-detail-line-height` | 23px |
| `--cte-detail-letter-spacing` | 0em |

## dark CSS variables

Define these in the app’s existing theme scope for this mode. Keep component styles linked to the variables.

| Variable | Value |
| --- | --- |
| `--theme-name` | tonnr |
| `--theme-icon-family` | Central |
| `--theme-icon-style` | outlined |
| `--toolbar-divider-bleed` | 1 |
| `--focus-ring-outline` | 2px solid color-mix(in srgb, #ffffff 50%, transparent) |
| `--icon-stroke-width` | 2 |
| `--icon-light-display` | none |
| `--icon-regular-display` | inline |
| `--icon-bold-display` | none |
| `--motion-duration` | 160ms |
| `--motion-easing` | cubic-bezier(0.16, 1, 0.3, 1) |
| `--motion-type` | easing |
| `--motion-visual-duration` | 0.16 |
| `--motion-bounce` | 0.2 |
| `--motion-enabled` | 1 |
| `--motion-small-iterations` | infinite |
| `--motion-large-duration` | 280ms |
| `--motion-large-easing` | cubic-bezier(0.16, 1, 0.3, 1) |
| `--motion-large-type` | easing |
| `--motion-large-visual-duration` | 0.28 |
| `--motion-large-bounce` | 0.3 |
| `--motion-large-iterations` | infinite |
| `--motion-popup-scale` | 0.96 |
| `--motion-press-distance` | 1px |
| `--option-badge-background` | color-mix(in srgb, var(--color-1) 10%, transparent) |
| `--option-badge-foreground` | #e5e5e5 |
| `--navigation-active-foreground` | #202020 |
| `--emphasis-chart-fill` | #e5e5e533 |
| `--surface-raised-image` | none |
| `--surface-raised-shadow` | 0 0 0 0 transparent |
| `--surface-recessed-image` | none |
| `--surface-recessed-shadow` | 0 0 0 0 transparent |
| `--space-zero` | 0px |
| `--space-xxs` | 4px |
| `--space-xs` | 8px |
| `--space-s` | 13px |
| `--space-m` | 17px |
| `--space-l` | 25px |
| `--space-xl` | 33px |
| `--space-xxl` | 50px |
| `--size-xxs` | 9px |
| `--line-xxs` | 13px |
| `--letter-spacing-xxs` | 0em |
| `--size-xs` | 11px |
| `--line-xs` | 15px |
| `--letter-spacing-xs` | 0em |
| `--size-s` | 13px |
| `--line-s` | 19px |
| `--letter-spacing-s` | 0em |
| `--size-m` | 15px |
| `--line-m` | 23px |
| `--letter-spacing-m` | 0em |
| `--size-l` | 23px |
| `--line-l` | 31px |
| `--letter-spacing-l` | 0em |
| `--size-xl` | 35px |
| `--line-xl` | 38px |
| `--letter-spacing-xl` | 0em |
| `--size-xxl` | 46px |
| `--line-xxl` | 50px |
| `--letter-spacing-xxl` | 0em |
| `--radius-zero` | 0px |
| `--radius-xs` | 18px |
| `--radius-s` | 28px |
| `--radius-m` | 42px |
| `--radius-l` | 50px |
| `--radius-xl` | 36px |
| `--radius-full` | 9999px |
| `--border-none` | 0px |
| `--border-s` | 0.5px |
| `--border-m` | 1.5px |
| `--border-l` | 2px |
| `--border-default-color` | rgb(0 0 0 / 0.1) |
| `--border-shadow-none` | 0 0 0 0 transparent |
| `--border-shadow-s` | 0 0 0 0.5px rgb(0 0 0 / 0.1) |
| `--border-shadow-m` | 0 0 0 1.5px rgb(0 0 0 / 0.1) |
| `--border-shadow-l` | 0 0 0 2px rgb(0 0 0 / 0.1) |
| `--font-ui` | "Sidebar Geist", sans-serif |
| `--weight-ui-regular` | 400 |
| `--weight-ui-medium` | 500 |
| `--weight-ui-heavy` | 700 |
| `--font-brand` | "Sidebar Geist", sans-serif |
| `--weight-brand-regular` | 400 |
| `--weight-brand-medium` | 500 |
| `--weight-brand-heavy` | 700 |
| `--font-editorial` | "Sidebar Geist", sans-serif |
| `--weight-editorial-regular` | 400 |
| `--weight-editorial-medium` | 500 |
| `--weight-editorial-heavy` | 700 |
| `--font-data` | "Sidebar Geist Mono", monospace |
| `--weight-data-regular` | 400 |
| `--weight-data-medium` | 500 |
| `--weight-data-heavy` | 700 |
| `--color-none` | transparent |
| `--color-1` | #e5e5e5 |
| `--color-1-transparent` | #e5e5e533 |
| `--color-2` | #b1b1b1 |
| `--color-2-transparent` | #b1b1b133 |
| `--color-3` | #777777 |
| `--color-3-transparent` | #77777733 |
| `--color-4` | #424242 |
| `--color-4-transparent` | #42424233 |
| `--neutral-1` | #000000 |
| `--neutral-1-transparent` | #00000033 |
| `--neutral-2` | #202020 |
| `--neutral-2-transparent` | #20202033 |
| `--neutral-3` | #2b2b2b |
| `--neutral-3-transparent` | #2b2b2b33 |
| `--neutral-4` | #383838 |
| `--neutral-4-transparent` | #38383833 |
| `--neutral-5` | #505050 |
| `--neutral-5-transparent` | #50505033 |
| `--neutral-6` | #777777 |
| `--neutral-6-transparent` | #77777733 |
| `--neutral-7` | #a3a3a3 |
| `--neutral-7-transparent` | #a3a3a333 |
| `--neutral-8` | #c6c6c6 |
| `--neutral-8-transparent` | #c6c6c633 |
| `--neutral-9` | #e5e5e5 |
| `--neutral-9-transparent` | #e5e5e533 |
| `--neutral-10` | #ffffff |
| `--neutral-10-transparent` | #ffffff33 |
| `--success` | #76ef6b |
| `--success-transparent` | #76ef6b33 |
| `--warning` | #ffa344 |
| `--warning-transparent` | #ffa34433 |
| `--error` | #ff5263 |
| `--error-transparent` | #ff526333 |
| `--shadow-none` | none |
| `--shadow-s` | 0px 1px 2px 0px #00000000 |
| `--shadow-m` | 0px 8px 24px 0px #00000000 |
| `--shadow-l` | 0px 12px 30px 0px #00000000 |
| `--cte-canvas` | #000000 |
| `--cte-surface` | #202020 |
| `--cte-surface-muted` | #2b2b2b |
| `--cte-text` | #ffffff |
| `--cte-text-muted` | #a3a3a3 |
| `--cte-border` | rgb(0 0 0 / 0.1) |
| `--cte-accent` | #e5e5e5 |
| `--cte-accent-text` | #202020 |
| `--cte-danger` | #ff5263 |
| `--cte-focus` | #e5e5e5 |
| `--cte-font` | "Sidebar Geist", sans-serif |
| `--cte-font-size` | 15px |
| `--cte-font-weight` | 400 |
| `--cte-line-height` | 23px |
| `--cte-letter-spacing` | 0em |
| `--cte-detail-font-size` | 15px |
| `--cte-detail-line-height` | 23px |
| `--cte-detail-letter-spacing` | 0em |

## Authored component assignments

These are project edits. The [component reference](tonnr-components.md) includes the effective assignments with defaults and shared parts resolved.

```json
{
  "componentTokens": {
    "checkbox:default:part:label:rest": {
      "textSize": "m"
    },
    "switch:default:part:control:rest": {
      "controlSize": "xl"
    },
    "switch:default:part:label:rest": {
      "textSize": "m"
    },
    "switch:default:part:row:rest": {
      "gap": "s"
    }
  },
  "componentVariants": {}
}
```

