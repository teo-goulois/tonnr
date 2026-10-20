// The React Compiler, which the app turns on, would give the layout's own components a cache of
// its own, `_c`, which the widgets' runtime does not have: this file is not compiled by it.
"use no memo";

import {
  AccessoryWidgetBackground,
  HStack,
  Image,
  Link,
  Spacer,
  Text,
  VStack,
  ZStack,
} from "@expo/ui/swift-ui";
import {
  background,
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  padding,
  rotationEffect,
  shapes,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { ReactNode } from "react";

import { WIDGET } from "./names";
import type { WidgetPill, WidgetPlace, WidgetProps } from "./props";

// The widgets of decision 074, drawn on iOS by expo-widgets with SwiftUI's own views. The layout
// runs in the widget extension, not in the app: it imports nothing and reads nothing outside
// itself, not even this file's constants, and draws what the app wrote for the entry
// (`entries.ts`). So it is one function, which the three widgets share, written as plainly as
// JavaScriptCore runs it once the bundler has compiled it alone: no spread, no optional chaining.
// The app's config names this file as the widgets' first layout, so that the gallery shows them
// before the app has run; the build reads it with every package but expo-widgets left empty.

/** The place a widget's person chose, where the system lets a widget be set up (iOS 17). */
type Chosen = { place?: string };
/** A color, or one of the system's strengths of ink. */
type Ink = Parameters<typeof foregroundStyle>[0];

function SeaLayout(props: WidgetProps, environment: WidgetEnvironment<Chosen | undefined>) {
  "widget";
  var family = environment.widgetFamily;
  var onLock =
    family === "accessoryCircular" ||
    family === "accessoryRectangular" ||
    family === "accessoryInline";
  var palette =
    props && props.palette
      ? environment.colorScheme === "dark"
        ? props.palette.dark
        : props.palette.light
      : null;
  // On the lock screen the system tints everything: the ink is its own, in two strengths.
  var ink: Ink = onLock || !palette ? { type: "hierarchical", style: "primary" } : palette.ink;
  var muted: Ink =
    onLock || !palette ? { type: "hierarchical", style: "secondary" } : palette.muted;
  var ground = onLock || !palette ? "#00000000" : palette.ground;

  function Line(line: {
    text: string;
    size: number;
    weight?: "regular" | "medium" | "semibold" | "bold";
    faint?: boolean;
    lines?: number;
  }) {
    return (
      <Text
        modifiers={[
          font({ size: line.size, weight: line.weight || "regular" }),
          monospacedDigit(),
          foregroundStyle(line.faint ? muted : ink),
          lineLimit(line.lines || 1),
          minimumScaleFactor(0.7),
        ]}
      >
        {line.text}
      </Text>
    );
  }

  function Pill(shown: { pill: WidgetPill; size: number }) {
    return (
      <Text
        modifiers={[
          font({ size: shown.size, weight: "semibold" }),
          monospacedDigit(),
          foregroundStyle(shown.pill.ink),
          lineLimit(1),
          minimumScaleFactor(0.7),
          padding({ horizontal: Math.round(shown.size * 0.5), vertical: 2 }),
          background(shown.pill.color, shapes.capsule()),
        ]}
      >
        {shown.pill.label}
      </Text>
    );
  }

  function Root(root: { url?: string; spacing?: number; children: ReactNode }) {
    var modifiers = [containerBackground(ground, "widget")];
    if (root.url) modifiers.push(widgetURL(root.url));
    return (
      <VStack alignment="leading" spacing={root.spacing || 4} modifiers={modifiers}>
        {root.children}
      </VStack>
    );
  }

  // Before the app has written anything: the sea's mark, and no word, which has no language yet.
  if (!props || !palette) {
    return (
      <Root>
        <Image
          systemName="water.waves"
          size={onLock ? 18 : 28}
          modifiers={[foregroundStyle(muted)]}
        />
      </Root>
    );
  }

  function Notice(shown: { title: string; body: string; url: string }) {
    if (family === "accessoryCircular") {
      return (
        <Root url={shown.url}>
          <ZStack>
            <AccessoryWidgetBackground />
            <Image systemName="water.waves" size={18} />
          </ZStack>
        </Root>
      );
    }
    if (onLock) {
      return (
        <Root url={shown.url}>
          <Line text={shown.title} size={13} weight="semibold" />
          <Line text={shown.body} size={11} faint lines={2} />
        </Root>
      );
    }
    return (
      <Root url={shown.url}>
        <Image systemName="water.waves" size={18} modifiers={[foregroundStyle(muted)]} />
        <Spacer />
        <Line text={shown.title} size={14} weight="semibold" lines={2} />
        <Line text={shown.body} size={12} faint lines={3} />
      </Root>
    );
  }

  if (props.notice) {
    return <Notice title={props.notice.title} body={props.notice.body} url={props.notice.url} />;
  }

  var places = props.places || {};
  var favorites = props.favorites || [];
  var none = props.empty || { title: "", body: "", url: "" };

  // The widget of the favourites: the first three, one on each line, each opening its place.
  if (props.view === "favorites") {
    var shownFavorites: { key: string; place: WidgetPlace }[] = [];
    favorites.forEach(function (key) {
      var found = places[key];
      if (found) shownFavorites.push({ key: key, place: found });
    });
    if (shownFavorites.length === 0) {
      return <Notice title={none.title} body={none.body} url={none.url} />;
    }
    var rows: ReactNode[] = [];
    shownFavorites.forEach(function (one, index) {
      var figures = one.place.figures;
      if (index > 0) rows.push(<Spacer key={"gap " + index} />);
      rows.push(
        <Link key={one.key} destination={one.place.url}>
          <HStack spacing={6}>
            <VStack alignment="leading" spacing={1}>
              <Line text={one.place.name} size={13} weight="semibold" />
              <Line text={one.place.note} size={10} faint />
            </VStack>
            <Spacer />
            {figures && figures.height ? <Pill pill={figures.height} size={13} /> : null}
            {figures && figures.period ? <Line text={figures.period} size={12} faint /> : null}
            {figures && figures.wind ? <Pill pill={figures.wind} size={11} /> : null}
          </HStack>
        </Link>,
      );
    });
    return <Root>{rows}</Root>;
  }

  // A widget of one place: the one its person chose, else the first of the favourites.
  var chosen = environment.configuration ? environment.configuration.place : undefined;
  var key = !chosen || chosen === "favorite" ? favorites[0] : chosen;
  var place = key ? places[key] : undefined;
  if (!place) {
    var gone = chosen && chosen !== "favorite" && props.missing ? props.missing : none;
    return <Notice title={gone.title} body={gone.body} url={gone.url} />;
  }
  var sea = place.figures;

  if (family === "accessoryCircular") {
    return (
      <Root url={place.url}>
        <ZStack>
          <AccessoryWidgetBackground />
          <VStack spacing={0}>
            <Image systemName="water.waves" size={11} />
            <Line text={sea && sea.height ? sea.height.label : "–"} size={15} weight="bold" />
          </VStack>
        </ZStack>
      </Root>
    );
  }

  if (onLock) {
    var waves = [sea && sea.height ? sea.height.label : "", sea && sea.period ? sea.period : ""]
      .filter(Boolean)
      .join(" · ");
    var wind =
      sea && sea.wind ? sea.wind.label + (sea.shore ? " " + sea.shore.toLowerCase() : "") : "";
    var rest = [wind, sea && sea.tide ? sea.tide : ""].filter(Boolean).join(" · ");
    return (
      <Root url={place.url}>
        <Line text={place.name} size={13} weight="semibold" />
        <Line text={waves || place.note} size={12} />
        {rest ? <Line text={rest} size={11} faint /> : null}
      </Root>
    );
  }

  // The next hours of one place, in columns, under its name.
  if (props.view === "hours" && place.hours) {
    var columns: ReactNode[] = [];
    place.hours.forEach(function (hour, index) {
      if (index > 0) columns.push(<Spacer key={"gap " + index} />);
      columns.push(
        <VStack key={hour.time} spacing={4}>
          <Line text={hour.time} size={11} faint />
          {hour.height ? <Pill pill={hour.height} size={13} /> : <Line text="–" size={13} />}
          <Line text={hour.period || "–"} size={11} />
          {hour.wind ? <Pill pill={hour.wind} size={10} /> : <Line text="–" size={10} faint />}
        </VStack>,
      );
    });
    return (
      <Root url={place.url}>
        <HStack spacing={6}>
          <Line text={place.name} size={14} weight="semibold" />
          <Spacer />
          <Line text={place.note} size={10} faint />
        </HStack>
        <Spacer />
        <HStack spacing={0}>{columns}</HStack>
      </Root>
    );
  }

  // One place now: the height and the period on the height's color, where the waves come from
  // after an arrow that points where they go, the wind and how it meets the shore, the tide.
  var height = sea && sea.height ? sea.height : null;
  return (
    <Root url={place.url} spacing={3}>
      <Line text={place.name} size={13} weight="semibold" />
      <Spacer />
      {height ? (
        <HStack
          spacing={5}
          alignment="lastTextBaseline"
          modifiers={[
            padding({ horizontal: 10, vertical: 3 }),
            background(height.color, shapes.capsule()),
          ]}
        >
          <Text
            modifiers={[
              font({ size: 20, weight: "semibold" }),
              monospacedDigit(),
              foregroundStyle(height.ink),
              lineLimit(1),
              minimumScaleFactor(0.6),
            ]}
          >
            {height.label}
          </Text>
          {sea && sea.period ? (
            <Text
              modifiers={[
                font({ size: 12, weight: "medium" }),
                monospacedDigit(),
                foregroundStyle(height.ink),
                lineLimit(1),
              ]}
            >
              {sea.period}
            </Text>
          ) : null}
        </HStack>
      ) : null}
      {sea && sea.wavesFrom && sea.wavesTo !== undefined ? (
        <HStack spacing={3}>
          <Image
            systemName="arrow.up"
            size={9}
            modifiers={[foregroundStyle(muted), rotationEffect(sea.wavesTo)]}
          />
          <Line text={sea.wavesFrom} size={11} faint />
        </HStack>
      ) : null}
      {sea && sea.wind ? (
        <HStack spacing={4}>
          <Pill pill={sea.wind} size={11} />
          {sea.shore ? <Line text={sea.shore} size={11} faint /> : null}
        </HStack>
      ) : null}
      {sea && sea.tide ? <Line text={sea.tide} size={11} faint /> : null}
      <Line text={place.note} size={10} faint />
    </Root>
  );
}

// The widgets of decision 074, made as the app starts, which keeps their layout in the space the
// app shares with them: the sea now, on the Home Screen and in the lock screen's two families, the
// next hours, and the favourites. Those whose place is chosen are those of `CHOSEN_PLACE`.
const seaNow = createWidget<WidgetProps, Chosen>(WIDGET.seaNow, SeaLayout);
const nextHours = createWidget<WidgetProps, Chosen>(WIDGET.nextHours, SeaLayout);
const favorites = createWidget<WidgetProps>(WIDGET.favorites, SeaLayout);

/** Every widget, by its name. */
export const WIDGETS = {
  [WIDGET.seaNow]: seaNow,
  [WIDGET.nextHours]: nextHours,
  [WIDGET.favorites]: favorites,
};

/** The widgets whose place is chosen as they are added, among the account's saved places. */
export const PLACE_WIDGETS = [seaNow, nextHours];
