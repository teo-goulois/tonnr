import { daylightOf } from "@repo/client/viewer/daylight";
import { useMemo } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { formatClock } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { Block } from "./block";

/**
 * When it gets light and dark at the place: first light, sunrise, sunset and last light, the
 * morning's two over the evening's, in tiles as the values now are: the web's `Daylight`
 * (`apps/web/src/components/viewer/details/daylight.tsx`). Today's, or tomorrow's once today's
 * last light is gone. A moment already gone is pale, as the tide's hours are.
 */
export function Daylight({
  now,
  place,
}: {
  now: number;
  place: { latitude: number; longitude: number };
}) {
  const { colors, space, radius } = useTheme();
  const { latitude, longitude } = place;
  const daylight = useMemo(
    () => daylightOf(now, { latitude, longitude }),
    [now, latitude, longitude],
  );
  const rows = [
    [
      { label: m.daylight_first_light(), at: daylight.firstLight },
      { label: m.daylight_sunrise(), at: daylight.sunrise },
    ],
    [
      { label: m.daylight_sunset(), at: daylight.sunset },
      { label: m.daylight_last_light(), at: daylight.lastLight },
    ],
  ];
  return (
    <Block
      title={m.daylight_title()}
      control={
        <Text size="s" tone="muted">
          {daylight.day === "today" ? m.daylight_today() : m.daylight_tomorrow()}
        </Text>
      }
    >
      <View style={{ gap: space.xs }}>
        {rows.map((row) => (
          <View key={row[0]!.label} style={{ flexDirection: "row", gap: space.xs }}>
            {row.map(({ label, at }) => {
              // The sun does not cross that height that day, near the poles.
              const shown = at ? formatClock(at) : "–";
              return (
                <View
                  key={label}
                  accessible
                  accessibilityLabel={`${label}, ${shown}`}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    gap: space.xxs,
                    paddingHorizontal: space.xs,
                    paddingVertical: space.xs,
                    borderRadius: radius.xs,
                    borderCurve: "continuous",
                    backgroundColor: colors["neutral-2"],
                  }}
                >
                  <Text size="xs" tone="muted" numberOfLines={1} dense>
                    {label}
                  </Text>
                  <Text
                    size="l"
                    weight="medium"
                    numeric
                    dense
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    tone={at && at.getTime() <= now ? "muted" : undefined}
                  >
                    {shown}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </Block>
  );
}
