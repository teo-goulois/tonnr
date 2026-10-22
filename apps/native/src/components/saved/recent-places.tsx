import { View } from "react-native";

import type { Recent } from "@/lib/recents";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import type { PlaceActions } from "./place-actions";
import { PlaceRows, SectionHeader } from "./place-section";

// What the reader looked at last, the last first, as the web's `RecentPlaces` lists it: rows of
// the mark of what each is and its name, a station's mark an empty disc, with nothing read of
// them, and what clears them beside the heading. A press opens the place again. Decision 042.
// Nothing is drawn when nothing was looked at.

export function RecentPlaces({
  recents,
  now,
  actions,
  onClear,
}: {
  recents: readonly Recent[];
  now: number;
  actions: PlaceActions;
  onClear: () => void;
}) {
  const { space } = useTheme();
  if (recents.length === 0) return null;
  return (
    <View style={{ gap: space.xs }}>
      <SectionHeader
        title={m.recents_title()}
        action={{ label: m.recents_clear(), onPress: onClear }}
      />
      <PlaceRows
        rows={recents.map((recent) => ({
          key: `${recent.kind}:${recent.id}`,
          item: { ref: { kind: recent.kind, id: recent.id }, name: recent.name },
        }))}
        now={now}
        // A spot looked at is one of the account's own.
        contextOf={(item) => ({ ownSpot: item.ref.kind === "spot" })}
        actions={actions}
      />
    </View>
  );
}
