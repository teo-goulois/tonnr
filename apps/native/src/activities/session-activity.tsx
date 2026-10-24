import { HStack, Image, Link, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityElement,
  accessibilityHidden,
  accessibilityLabel,
  font,
  foregroundStyle,
  lineLimit,
  monospacedDigit,
  padding,
  rotationEffect,
} from "@expo/ui/swift-ui/modifiers";
import { type LiveActivityFactory, createLiveActivity } from "expo-widgets";

import { activitiesEnabled, startQuietly } from "../../modules/live-activities";
import type { SessionShown } from "./session-shown";

// The Live Activity of a session in progress, on an iPhone: decision 074. The app starts it in
// the foreground, as the session begins, with everything written already, and ends it as the
// session ends: no push of Apple's carries it, and nothing of it leaves the phone. The app's
// module starts it, `startQuietly`, because expo-widgets asks Apple for a token of every activity
// it starts once the app takes Apple's pushes, which would tell Apple when a session begins; the
// library's factory draws it, finds it, updates it and ends it. The time since the start counts
// on the phone. Android's is a notification (session-activity.android.tsx).

/** The name expo-widgets keeps the layout under, and finds the activity by. */
const SESSION_ACTIVITY = "session-in-progress";

/**
 * The layout, which the build writes out as a string for the widget's runtime: it names nothing
 * outside itself but the components and modifiers of `@expo/ui/swift-ui`, which that runtime
 * holds under the same names.
 */
function SessionActivity(props: SessionShown) {
  "widget";
  const range = { lower: new Date(props.startedAt), upper: new Date(props.endsBy) };
  const muted = foregroundStyle({ type: "hierarchical", style: "secondary" });
  const small = font({ textStyle: "footnote" });
  const tides = props.lines.map((line, index) => (
    <Text key={`line-${index}`} modifiers={[small, muted, lineLimit(1)]}>
      {line}
    </Text>
  ));
  // The wind's line, with where it comes from as everywhere in the app: an arrow toward where it
  // goes, then the point. A screen reader hears the line as it is said, the arrow left out.
  const blows = props.wind;
  const wind =
    blows === null ? null : (
      <HStack
        key="wind"
        spacing={0}
        modifiers={[accessibilityElement("ignore"), accessibilityLabel(blows.spoken)]}
      >
        <Text modifiers={[small, muted, lineLimit(1)]}>{blows.before}</Text>
        {blows.bearing === null ? null : (
          <Image
            systemName="arrow.up"
            size={10}
            modifiers={[
              padding({ horizontal: 3 }),
              muted,
              rotationEffect(blows.bearing.toward),
              accessibilityHidden(),
            ]}
          />
        )}
        <Text modifiers={[small, muted, lineLimit(1)]}>
          {blows.bearing === null ? blows.after : `${blows.bearing.point}${blows.after}`}
        </Text>
      </HStack>
    );
  // The wind's line has the width of the activity to itself, under the lines that "End" stands
  // beside: it is the longest of them, and in Spanish or Portuguese it did not fit beside the
  // button, which iOS cut short with an ellipsis.
  const surfer = (
    <Image systemName="figure.surfing" modifiers={[accessibilityLabel(props.title)]} />
  );
  return {
    banner: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ all: 16 })]}>
        <HStack alignment="center" spacing={12}>
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ textStyle: "headline" }), lineLimit(1)]}>{props.place}</Text>
            <Text
              timerInterval={range}
              countsDown={false}
              modifiers={[font({ size: 30, weight: "semibold" }), monospacedDigit()]}
            />
            <Text modifiers={[small, muted]}>{props.since}</Text>
            {tides}
          </VStack>
          <Spacer />
          <Link destination={props.endUrl} label={props.end} />
        </HStack>
        {wind}
      </VStack>
    ),
    compactLeading: surfer,
    compactTrailing: (
      <Text timerInterval={range} countsDown={false} modifiers={[monospacedDigit()]} />
    ),
    minimal: surfer,
    expandedLeading: (
      <Text modifiers={[font({ textStyle: "headline" }), lineLimit(1)]}>{props.place}</Text>
    ),
    expandedTrailing: (
      <Text
        timerInterval={range}
        countsDown={false}
        modifiers={[font({ weight: "semibold" }), monospacedDigit()]}
      />
    ),
    expandedBottom: (
      <VStack alignment="leading" spacing={2}>
        <HStack alignment="center" spacing={12}>
          <VStack alignment="leading" spacing={2}>
            {tides}
          </VStack>
          <Spacer />
          <Link destination={props.endUrl} label={props.end} />
        </HStack>
        {wind}
      </VStack>
    ),
  };
}

// Made once the app runs: expo-widgets keeps the layout an activity is drawn with once its
// factory was made.
let factory: LiveActivityFactory<SessionShown> | null = null;
const activities = () => (factory ??= createLiveActivity(SESSION_ACTIVITY, SessionActivity));

/** The activity of the session that runs, if iOS shows it. */
const current = () => activities().getInstances()[0];

/**
 * Shows the session in progress on the lock screen and in the Dynamic Island. False where the
 * system does not let the app, whose person turned Live Activities off for it.
 */
export async function showSession(shown: SessionShown) {
  if (!activitiesEnabled()) return false;
  try {
    // The factory keeps the layout the activity is drawn with, under its name, as it is made.
    for (const running of activities().getInstances()) await running.end("immediate");
    startQuietly(SESSION_ACTIVITY, JSON.stringify(shown), shown.openUrl);
    return true;
  } catch {
    return false;
  }
}

/** Shows what the session's activity says anew: the sea once it was read, another place. */
export async function updateSession(shown: SessionShown) {
  try {
    await current()?.update(shown);
  } catch {
    // An activity iOS ended already.
  }
}

/** Takes the session's activity away, as the session ends or is forgotten. */
export async function hideSession() {
  try {
    for (const running of activities().getInstances()) await running.end("immediate");
  } catch {
    // An activity iOS ended already.
  }
}

/** Whether iOS still shows the session's activity: its person may have swiped it away. */
export async function sessionShownNow(): Promise<boolean | undefined> {
  try {
    return current() !== undefined;
  } catch {
    return undefined;
  }
}
