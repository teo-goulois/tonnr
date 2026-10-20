import { existsSync, readFileSync } from "node:fs";

import { APP_SCHEME } from "@repo/config/app";
import { LOCALES } from "@repo/config/locales";
import type { ConfigContext, ExpoConfig } from "expo/config";
import { describe, expect, it } from "vitest";

import { CHOSEN_PLACE, FIRST_FAVORITE, PLACE_PARAMETER, WIDGET } from "./names";

// The app's config writes the widgets' names again, since it cannot import the app's files: this
// holds the two to each other, and to the layouts that make the widgets (decision 074).

const from = (path: string) => new URL(path, import.meta.url).pathname;

type WidgetConfig = {
  name: string;
  displayName: string;
  description: string;
  ios: {
    supportedFamilies: string[];
    initialLayout: string;
    configuration?: {
      title: string;
      parameters: Record<
        string,
        { type: string; dynamic: boolean; default: string; values: { value: string }[] }
      >;
    };
  };
  android: null;
};
type WidgetsPlugin = { bundleIdentifier: string; groupIdentifier: string; widgets: WidgetConfig[] };

async function config(): Promise<ExpoConfig> {
  const { default: write } = await import("../../app.config");
  return write({ config: {} } as ConfigContext);
}

async function widgetsPlugin() {
  const plugin = (await config()).plugins?.find(
    (one) => Array.isArray(one) && one[0] === "expo-widgets",
  );
  return (plugin as [string, WidgetsPlugin])[1];
}

describe("the widgets the app's config gives the extension", () => {
  it("are the app's, by the same names, and those whose place is chosen", async () => {
    const { widgets } = await widgetsPlugin();
    expect(widgets.map((widget) => widget.name).sort()).toEqual(Object.values(WIDGET).sort());
    expect(
      widgets.filter((widget) => widget.ios.configuration).map((widget) => widget.name),
    ).toEqual(CHOSEN_PLACE);
  });

  it("draw the sea now on the lock screen too, in its circle and its rectangle", async () => {
    const families = Object.fromEntries(
      (await widgetsPlugin()).widgets.map((widget) => [widget.name, widget.ios.supportedFamilies]),
    );
    expect(families).toEqual({
      [WIDGET.seaNow]: ["systemSmall", "accessoryCircular", "accessoryRectangular"],
      [WIDGET.nextHours]: ["systemMedium"],
      [WIDGET.favorites]: ["systemMedium"],
    });
  });

  it("are chosen among the saved places the app gives, the first favourite before any", async () => {
    for (const widget of (await widgetsPlugin()).widgets) {
      const parameters = widget.ios.configuration?.parameters;
      if (!parameters) continue;
      expect(Object.keys(parameters)).toEqual([PLACE_PARAMETER]);
      expect(parameters[PLACE_PARAMETER]).toMatchObject({
        type: "enum",
        dynamic: true,
        default: FIRST_FAVORITE,
        values: [{ value: FIRST_FAVORITE }],
      });
    }
  });

  it("live in an extension of their own, in the group the app shares", async () => {
    const plugin = await widgetsPlugin();
    expect(plugin.bundleIdentifier).toBe(`${APP_SCHEME}.widgets`);
    const entitlements = (await config()).ios?.entitlements ?? {};
    expect(entitlements["com.apple.security.application-groups"]).toEqual([plugin.groupIdentifier]);
  });

  it("are drawn on iOS alone, by the layouts that make them", async () => {
    const layouts = readFileSync(from("./layouts.tsx"), "utf8");
    for (const widget of (await widgetsPlugin()).widgets) {
      expect(widget.android).toBeNull();
      expect(existsSync(from(`../../${widget.ios.initialLayout}`))).toBe(true);
      const key = Object.entries(WIDGET).find(([, name]) => name === widget.name)?.[0];
      expect(layouts).toMatch(new RegExp(`createWidget<[^>]+>\\(WIDGET\\.${key}, SeaLayout\\)`));
    }
  });

  it("are named in every language by the extension's own strings", async () => {
    const { widgets } = await widgetsPlugin();
    const locales = (await config()).locales as Record<
      string,
      { ios: { "Localizable.strings": Record<string, string> } }
    >;
    for (const locale of LOCALES) {
      const strings = locales[locale]!.ios["Localizable.strings"];
      for (const widget of widgets) {
        expect(strings[widget.displayName]).toBeTruthy();
        expect(strings[widget.description]).toBeTruthy();
        const title = widget.ios.configuration?.title;
        if (title) expect(strings[`${title} Configuration`]).toBe(strings[title]);
      }
    }
    const french = locales.fr!.ios["Localizable.strings"];
    expect(french["Sea now"]).toBe("La mer maintenant");
    expect(french["First of your favorites"]).toBe("Le premier de tes favoris");
  });

  it("leave each language's words for the phone's permissions where they were", async () => {
    const locales = (await config()).locales as Record<string, Record<string, unknown>>;
    expect(locales.fr?.NSCameraUsageDescription).toBeTruthy();
    expect(locales.en?.NSCameraUsageDescription).toBeUndefined();
  });
});
