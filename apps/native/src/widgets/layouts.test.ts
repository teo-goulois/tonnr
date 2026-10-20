import { createRequire } from "node:module";
import { dirname } from "node:path";

import { describe, expect, it } from "vitest";

import { placeUrl, signedOutTimelines, timelinesOf } from "./entries";
import * as names from "./names";
import { WIDGET } from "./names";
import type { WidgetProps } from "./props";
import { answerOf, breakSea, buoySea, now } from "./samples";

// The layout of the widgets as the extension runs it: compiled by Babel as Metro compiles it for
// iOS, the React Compiler with it as the app's config turns it on, into a string, then evaluated
// alone, with nothing in reach but what the widgets' runtime gives it (expo-widgets'
// bundle/index.ts). A layout that reads anything else, or that a compiler gave a helper of its
// own, such as the React Compiler's cache `_c`, fails here as it would fail on the phone. The views are
// stood in for by their names, so what is checked is what the layout draws, not how SwiftUI
// draws it.

const require = createRequire(import.meta.url);
const from = (path: string) => new URL(path, import.meta.url).pathname;
const preset = dirname(
  require.resolve("babel-preset-expo/package.json", { paths: [from("../..")] }),
);
const babel = require(require.resolve("@babel/core", { paths: [preset] })) as {
  transformFileSync: (file: string, options: object) => { code: string };
};

type Node = { type: unknown; key?: unknown; props: Record<string, unknown> };

/** Each widget's layout, by its name, as the app gives it to expo-widgets. */
function compiledLayouts() {
  const { code } = babel.transformFileSync(from("./layouts.tsx"), {
    cwd: from("../.."),
    configFile: false,
    babelrc: false,
    presets: [require.resolve("babel-preset-expo", { paths: [from("../..")] })],
    caller: {
      name: "metro",
      bundler: "metro",
      platform: "ios",
      isDev: false,
      isServer: false,
      supportsReactCompiler: true,
    },
  });
  const layouts: Record<string, string> = {};
  const modules: Record<string, unknown> = {
    "expo-widgets": {
      createWidget: (name: string, layout: string) => {
        layouts[name] = layout;
        return {};
      },
    },
    "./names": names,
  };
  const required = (name: string) =>
    name in modules
      ? modules[name]
      : name.startsWith("@babel/runtime/")
        ? require(require.resolve(name, { paths: [preset] }))
        : {};
  new Function("require", "module", "exports", code)(required, { exports: {} }, {});
  return layouts;
}

const COMPONENTS = [
  "AccessoryWidgetBackground",
  "HStack",
  "Image",
  "Link",
  "Spacer",
  "Text",
  "VStack",
  "ZStack",
];
const MODIFIERS = [
  "background",
  "containerBackground",
  "font",
  "foregroundStyle",
  "lineLimit",
  "minimumScaleFactor",
  "monospacedDigit",
  "padding",
  "rotationEffect",
  "widgetURL",
];

/** The widgets' runtime, as far as the layout reads it: SwiftUI's views and their modifiers. */
function runtime() {
  const element = (type: unknown, config: Record<string, unknown>, key?: unknown) => ({
    type,
    key,
    props: config,
  });
  return {
    ...Object.fromEntries(COMPONENTS.map((name) => [name, name])),
    ...Object.fromEntries(
      MODIFIERS.map((name) => [name, (...args: unknown[]) => ({ $type: name, args })]),
    ),
    shapes: { capsule: () => ({ shape: "capsule" }) },
    _jsx: element,
    _jsxs: element,
    _Fragment: "Fragment",
  };
}

/** Resolves the layout's own components, as the runtime's `normalizeWidgetTree` does. */
function resolved(node: unknown): unknown {
  let current = node as Node | null;
  while (current && typeof current === "object" && typeof current.type === "function") {
    current = (current.type as (props: unknown) => Node)(current.props);
  }
  if (Array.isArray(current)) return current.map(resolved);
  if (current && typeof current === "object" && "props" in current) {
    const children = current.props.children;
    return {
      ...current,
      props: { ...current.props, ...(children !== undefined && { children: resolved(children) }) },
    };
  }
  return current;
}

const layouts = compiledLayouts();

function draw(name: string, props: WidgetProps | undefined, environment: object) {
  const globals = runtime();
  const layout = new Function(...Object.keys(globals), `"use strict"; return (${layouts[name]});`)(
    ...Object.values(globals),
  ) as (props: unknown, environment: object) => unknown;
  return resolved(layout(props, environment)) as Node;
}

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const one = node as Node;
  return [one, ...nodes(one.props.children)];
}

const textsOf = (node: Node) =>
  nodes(node)
    .filter((one) => one.type === "Text")
    .map((one) => one.props.children);

const modifiersOf = (node: Node) =>
  (node.props.modifiers ?? []) as { $type: string; args: unknown[] }[];

/** What a press on the whole widget opens. */
const urlOf = (node: Node) => modifiersOf(node).find((one) => one.$type === "widgetURL")?.args[0];

const small = (place = "favorite") => ({
  widgetFamily: "systemSmall",
  colorScheme: "light",
  configuration: { place },
});

const places = {
  places: [
    { kind: "break" as const, id: "b1" },
    { kind: "station" as const, id: "s1" },
  ],
  favorites: [{ kind: "break" as const, id: "b1" }],
};
const timelines = () => timelinesOf({ answer: answerOf(breakSea(), buoySea()), places, now });
const first = (name: keyof ReturnType<typeof timelines>) => timelines()[name][0]!.props;

describe("the widgets' layout", () => {
  it("is made by every widget, from one compiled function", () => {
    expect(Object.keys(layouts).sort()).toEqual(Object.values(WIDGET).sort());
    expect(new Set(Object.values(layouts)).size).toBe(1);
  });

  it("is left alone by the React Compiler, whose cache the widgets' runtime does not have", () => {
    for (const layout of Object.values(layouts)) expect(layout).not.toMatch(/\b_c\(/);
  });

  it("draws the sea's mark on the theme's ground before the app has written anything", () => {
    const root = draw(WIDGET.seaNow, undefined, small());
    expect(root.type).toBe("VStack");
    expect(modifiersOf(root).map((one) => one.$type)).toEqual(["containerBackground"]);
    expect(nodes(root).some((one) => one.type === "Image")).toBe(true);
    expect(textsOf(root)).toEqual([]);
  });

  it("says that the account is signed out, and opens the sign-in", () => {
    const [entry] = signedOutTimelines()[WIDGET.seaNow];
    const root = draw(WIDGET.seaNow, entry!.props, small());
    expect(textsOf(root)).toEqual(["Signed out", "Sign in to see the sea at your places."]);
    expect(urlOf(root)).toBe("app.tonnr://sign-in");
  });

  it("shows the first of the favourites until a place is chosen, and opens it", () => {
    const root = draw(WIDGET.seaNow, first(WIDGET.seaNow), small());
    const texts = textsOf(root);
    expect(texts[0]).toBe("La Côte");
    expect(texts).toContain("Offshore");
    expect(urlOf(root)).toBe(placeUrl({ kind: "break", id: "b1" }));
    expect(modifiersOf(root)[0]).toEqual({
      $type: "containerBackground",
      args: ["#ffffff", "widget"],
    });
  });

  it("writes the height and the period on the height's color", () => {
    const props = first(WIDGET.seaNow);
    const height = props.places!["break:b1"]!.figures!.height!;
    const root = draw(WIDGET.seaNow, props, small());
    const pill = nodes(root).find((one) =>
      modifiersOf(one).some((modifier) => modifier.$type === "background"),
    )!;
    expect(textsOf(pill)).toEqual(["1.1 m", "12 s"]);
    expect(modifiersOf(pill).find((one) => one.$type === "background")?.args[0]).toBe(height.color);
  });

  it("writes where the waves come from after an arrow that points where they go", () => {
    const root = draw(WIDGET.seaNow, first(WIDGET.seaNow), small());
    const arrow = nodes(root).find((one) => one.type === "Image")!;
    expect(arrow.props.systemName).toBe("arrow.up");
    expect(modifiersOf(arrow).find((one) => one.$type === "rotationEffect")?.args).toEqual([110]);
    expect(textsOf(root)).toContain("WNW");
  });

  it("shows the place its person chose, on the dark ground in the dark", () => {
    const root = draw(WIDGET.seaNow, first(WIDGET.seaNow), {
      ...small("station:s1"),
      colorScheme: "dark",
    });
    expect(textsOf(root)[0]).toBe("Buoy s1");
    expect(urlOf(root)).toBe(placeUrl({ kind: "station", id: "s1" }));
    expect(modifiersOf(root)[0]?.args[0]).toBe(first(WIDGET.seaNow).palette.dark.ground);
  });

  it("says of a chosen place it was given none of what the widgets are given", () => {
    const root = draw(WIDGET.seaNow, first(WIDGET.seaNow), small("spot:gone"));
    expect(textsOf(root)).toEqual([
      "Can't show this place",
      "Widgets show your first 12 saved places, favorites first. Hold the widget to choose another.",
    ]);
    expect(urlOf(root)).toBe("app.tonnr://app?panel=saved");
  });

  it("asks for a favourite when there is none", () => {
    const props = timelinesOf({
      answer: answerOf(buoySea()),
      places: { ...places, favorites: [] },
      now,
    })[WIDGET.seaNow][0]!.props;
    expect(textsOf(draw(WIDGET.seaNow, props, small()))).toEqual([
      "No favorites yet",
      "Save a place to your favorites, or hold the widget to choose one.",
    ]);
  });

  it("asks the widget of the favourites for a favourite, without its settings", () => {
    const props = timelinesOf({
      answer: answerOf(buoySea()),
      places: { ...places, favorites: [] },
      now,
    })[WIDGET.favorites][0]!.props;
    const root = draw(WIDGET.favorites, props, {
      widgetFamily: "systemMedium",
      colorScheme: "light",
    });
    expect(textsOf(root)).toEqual([
      "No favorites yet",
      "Save a place to your favorites to see it here.",
    ]);
  });

  it("draws the next hours in columns", () => {
    const root = draw(WIDGET.nextHours, first(WIDGET.nextHours), {
      widgetFamily: "systemMedium",
      colorScheme: "light",
      configuration: { place: "favorite" },
    });
    const texts = textsOf(root);
    expect(texts[0]).toBe("La Côte");
    expect(texts.filter((text) => typeof text === "string" && text.endsWith(" m"))).toEqual([
      "1.1 m",
      "1.4 m",
      "1.8 m",
      "2.2 m",
    ]);
  });

  it("keeps the columns of the next hours apart the night the clocks go back", () => {
    const props = first(WIDGET.nextHours);
    const place = props.places!["break:b1"]!;
    // In Paris on 2026-10-25, 00:00 and 01:00 UTC are both 02:00.
    const hours = place.hours!.map((hour) => ({ ...hour, time: "02:00" }));
    const root = draw(
      WIDGET.nextHours,
      { ...props, places: { "break:b1": { ...place, hours } } },
      { widgetFamily: "systemMedium", colorScheme: "light", configuration: { place: "favorite" } },
    );
    const columns = nodes(root).filter(
      (one) => one.type === "VStack" && textsOf(one).includes("02:00") && one !== root,
    );
    expect(columns).toHaveLength(hours.length);
    expect(new Set(columns.map((one) => one.key)).size).toBe(hours.length);
  });

  it("draws each favourite on its line, each opening its place", () => {
    const root = draw(WIDGET.favorites, first(WIDGET.favorites), {
      widgetFamily: "systemMedium",
      colorScheme: "light",
    });
    const links = nodes(root).filter((one) => one.type === "Link");
    expect(links.map((one) => one.props.destination)).toEqual([
      placeUrl({ kind: "break", id: "b1" }),
    ]);
    expect(urlOf(root)).toBeUndefined();
  });

  it("draws the height alone on the lock screen's circle, in the system's ink", () => {
    const root = draw(WIDGET.seaNow, first(WIDGET.seaNow), {
      widgetFamily: "accessoryCircular",
      colorScheme: "dark",
      configuration: { place: "favorite" },
    });
    expect(nodes(root).some((one) => one.type === "AccessoryWidgetBackground")).toBe(true);
    expect(textsOf(root)).toEqual(["1.1 m"]);
    expect(modifiersOf(root)[0]?.args[0]).toBe("#00000000");
  });

  it("draws the height, the wind and the tide on the lock screen's rectangle", () => {
    const root = draw(WIDGET.seaNow, first(WIDGET.seaNow), {
      widgetFamily: "accessoryRectangular",
      colorScheme: "light",
      configuration: { place: "favorite" },
    });
    const [name, waves, rest] = textsOf(root) as string[];
    expect(name).toBe("La Côte");
    expect(waves).toBe("1.1 m · 12 s");
    expect(rest).toMatch(/^10 kn offshore · High tide /);
  });
});
